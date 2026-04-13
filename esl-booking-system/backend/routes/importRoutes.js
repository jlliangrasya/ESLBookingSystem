const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const notify = require('../utils/notify');
const { logAction } = require('../utils/audit');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'));
        }
    },
});

// Helper: validate email format
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Helper: CSV template columns
const STUDENT_COLUMNS = ['name', 'email', 'password', 'guardian_name', 'nationality', 'age'];
const TEACHER_COLUMNS = ['name', 'email', 'password', 'nationality', 'age'];

// POST /students — Bulk import students
router.post('/students', authenticateToken, requireRole('company_admin'), upload.single('file'), async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const userId = req.user.id;

        if (!req.file) return res.status(400).json({ message: 'CSV file is required' });

        // Parse CSV
        let records;
        try {
            records = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true });
        } catch (parseErr) {
            return res.status(400).json({ message: 'Invalid CSV format: ' + parseErr.message });
        }

        if (records.length === 0) return res.status(400).json({ message: 'CSV file is empty' });

        // Get plan limits
        const [[company]] = await pool.query(
            `SELECT c.*, sp.max_students, sp.name AS plan_name
             FROM companies c JOIN subscription_plans sp ON c.subscription_plan_id = sp.id
             WHERE c.id = ?`,
            [companyId]
        );
        if (!company) return res.status(400).json({ message: 'Company not found' });

        const [[{ currentCount }]] = await pool.query(
            "SELECT COUNT(*) AS currentCount FROM users WHERE company_id = ? AND role = 'student' AND is_active = TRUE",
            [companyId]
        );
        const remainingSeats = company.max_students - currentCount;

        // Batch email check
        const allEmails = records.map(r => (r.email || '').trim().toLowerCase()).filter(Boolean);
        let existingEmails = new Set();
        if (allEmails.length > 0) {
            const [existingRows] = await pool.query('SELECT LOWER(email) AS email FROM users WHERE email IN (?)', [allEmails]);
            existingEmails = new Set(existingRows.map(r => r.email));
        }

        const errors = [];
        const validRows = [];
        let imported = 0;

        for (let i = 0; i < records.length; i++) {
            const row = records[i];
            const rowNum = i + 2; // 1-indexed + header row
            const name = (row.name || '').trim();
            const email = (row.email || '').trim().toLowerCase();
            const password = (row.password || '').trim();

            if (!name || !email || !password) {
                errors.push({ row: rowNum, email: email || '(empty)', reason: 'Missing required fields (name, email, password)' });
                continue;
            }
            if (!isValidEmail(email)) {
                errors.push({ row: rowNum, email, reason: 'Invalid email format' });
                continue;
            }
            if (existingEmails.has(email)) {
                errors.push({ row: rowNum, email, reason: 'Email already registered' });
                continue;
            }
            if (imported >= remainingSeats) {
                errors.push({ row: rowNum, email, reason: `Plan limit reached (${company.max_students} max students on ${company.plan_name})` });
                continue;
            }

            // Prevent duplicates within the CSV itself
            if (validRows.some(r => r[4] === email)) {
                errors.push({ row: rowNum, email, reason: 'Duplicate email in CSV' });
                continue;
            }

            validRows.push([
                companyId, 'student', name, email, password,
                (row.guardian_name || '').trim() || null,
                (row.nationality || '').trim() || null,
                row.age ? parseInt(row.age) || null : null,
            ]);
            // Mark as taken so later rows in same CSV see it
            existingEmails.add(email);
            imported++;
        }

        // Bulk insert
        if (validRows.length > 0) {
            // Use individual inserts to match existing pattern and avoid issues
            for (const row of validRows) {
                await pool.query(
                    `INSERT INTO users (company_id, role, name, email, password, guardian_name, nationality, age)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    row
                );
            }
        }

        // Log import
        await pool.query(
            `INSERT INTO bulk_import_logs (company_id, imported_by, import_type, total_rows, success_count, skipped_count, error_details)
             VALUES (?, ?, 'students', ?, ?, ?, ?)`,
            [companyId, userId, records.length, imported, errors.length, errors.length > 0 ? JSON.stringify(errors) : null]
        );

        // Notify admins
        const [admins] = await pool.query(
            "SELECT id FROM users WHERE company_id = ? AND role = 'company_admin'",
            [companyId]
        );
        Promise.all(admins.map(admin => notify({
            userId: admin.id, companyId,
            type: 'bulk_import',
            title: 'Student import completed',
            message: `${imported} students imported, ${errors.length} skipped.`,
        }))).catch(() => {});

        logAction(companyId, userId, 'bulk_import_students', 'import', null, { imported, skipped: errors.length });

        res.json({ imported, skipped: errors.length, total: records.length, errors });
    } catch (err) {
        console.error('Bulk import students error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /teachers — Bulk import teachers
router.post('/teachers', authenticateToken, requireRole('company_admin'), upload.single('file'), async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const userId = req.user.id;

        if (!req.file) return res.status(400).json({ message: 'CSV file is required' });

        let records;
        try {
            records = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true });
        } catch (parseErr) {
            return res.status(400).json({ message: 'Invalid CSV format: ' + parseErr.message });
        }

        if (records.length === 0) return res.status(400).json({ message: 'CSV file is empty' });

        const [[company]] = await pool.query(
            `SELECT c.*, sp.max_teachers, sp.name AS plan_name
             FROM companies c JOIN subscription_plans sp ON c.subscription_plan_id = sp.id
             WHERE c.id = ?`,
            [companyId]
        );
        if (!company) return res.status(400).json({ message: 'Company not found' });

        const [[{ currentCount }]] = await pool.query(
            "SELECT COUNT(*) AS currentCount FROM users WHERE company_id = ? AND role = 'teacher' AND is_active = TRUE",
            [companyId]
        );
        const remainingSeats = company.max_teachers - currentCount;

        const allEmails = records.map(r => (r.email || '').trim().toLowerCase()).filter(Boolean);
        let existingEmails = new Set();
        if (allEmails.length > 0) {
            const [existingRows] = await pool.query('SELECT LOWER(email) AS email FROM users WHERE email IN (?)', [allEmails]);
            existingEmails = new Set(existingRows.map(r => r.email));
        }

        const errors = [];
        const validRows = [];
        let imported = 0;

        for (let i = 0; i < records.length; i++) {
            const row = records[i];
            const rowNum = i + 2;
            const name = (row.name || '').trim();
            const email = (row.email || '').trim().toLowerCase();
            const password = (row.password || '').trim();

            if (!name || !email || !password) {
                errors.push({ row: rowNum, email: email || '(empty)', reason: 'Missing required fields (name, email, password)' });
                continue;
            }
            if (!isValidEmail(email)) {
                errors.push({ row: rowNum, email, reason: 'Invalid email format' });
                continue;
            }
            if (existingEmails.has(email)) {
                errors.push({ row: rowNum, email, reason: 'Email already registered' });
                continue;
            }
            if (imported >= remainingSeats) {
                errors.push({ row: rowNum, email, reason: `Plan limit reached (${company.max_teachers} max teachers on ${company.plan_name})` });
                continue;
            }
            if (validRows.some(r => r[4] === email)) {
                errors.push({ row: rowNum, email, reason: 'Duplicate email in CSV' });
                continue;
            }

            validRows.push([
                companyId, 'teacher', name, email, password,
                null, // guardian_name not applicable
                (row.nationality || '').trim() || null,
                row.age ? parseInt(row.age) || null : null,
            ]);
            existingEmails.add(email);
            imported++;
        }

        if (validRows.length > 0) {
            for (const row of validRows) {
                await pool.query(
                    `INSERT INTO users (company_id, role, name, email, password, guardian_name, nationality, age)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    row
                );
            }
        }

        await pool.query(
            `INSERT INTO bulk_import_logs (company_id, imported_by, import_type, total_rows, success_count, skipped_count, error_details)
             VALUES (?, ?, 'teachers', ?, ?, ?, ?)`,
            [companyId, userId, records.length, imported, errors.length, errors.length > 0 ? JSON.stringify(errors) : null]
        );

        const [admins] = await pool.query(
            "SELECT id FROM users WHERE company_id = ? AND role = 'company_admin'",
            [companyId]
        );
        Promise.all(admins.map(admin => notify({
            userId: admin.id, companyId,
            type: 'bulk_import',
            title: 'Teacher import completed',
            message: `${imported} teachers imported, ${errors.length} skipped.`,
        }))).catch(() => {});

        logAction(companyId, userId, 'bulk_import_teachers', 'import', null, { imported, skipped: errors.length });

        res.json({ imported, skipped: errors.length, total: records.length, errors });
    } catch (err) {
        console.error('Bulk import teachers error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /logs — Import history
router.get('/logs', authenticateToken, requireRole('company_admin'), async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const [rows] = await pool.query(
            `SELECT bil.*, u.name AS imported_by_name
             FROM bulk_import_logs bil
             JOIN users u ON bil.imported_by = u.id
             WHERE bil.company_id = ?
             ORDER BY bil.created_at DESC
             LIMIT 50`,
            [companyId]
        );
        res.json(rows);
    } catch (err) {
        console.error('Import logs error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /template/:type — Download CSV template
router.get('/template/:type', authenticateToken, requireRole('company_admin'), (req, res) => {
    const { type } = req.params;
    let columns;
    if (type === 'students') {
        columns = STUDENT_COLUMNS;
    } else if (type === 'teachers') {
        columns = TEACHER_COLUMNS;
    } else {
        return res.status(400).json({ message: 'Invalid type. Use "students" or "teachers".' });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${type}_template.csv"`);
    res.send(columns.join(',') + '\n');
});

module.exports = router;
