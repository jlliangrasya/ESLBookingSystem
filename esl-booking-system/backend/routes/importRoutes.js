const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const { requirePermission } = require('../utils/permissions');
const notify = require('../utils/notify');
const { logAction } = require('../utils/audit');
const { sendMail } = require('../utils/mailer');
const { generateTempPassword } = require('../utils/tempPassword');
const { readSheet, mapRows, parseAge, isValidEmail } = require('../utils/rosterSheet');

// ─────────────────────────────────────────────────────────────────────────────
// Bulk import runs in two steps, deliberately.
//
//   1. POST /parse   — reads the spreadsheet and hands the rows back. Touches
//                      no tables. The roster file carries only the facts the
//                      school already has (names, guardians, ages, emails).
//   2. POST /students or /teachers — creates the accounts from a JSON payload
//                      the admin has reviewed, with the login credentials they
//                      filled in (students) or that we generated (teachers).
//
// Splitting it this way is what makes the preview screen possible: logins are
// never read out of the uploaded file, so a stray "password" column in someone's
// spreadsheet can't quietly become a real credential. The admin sets every login
// on screen, looking at the parsed roster.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ROWS = 500;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
    fileFilter: (req, file, cb) => {
        const name = (file.originalname || '').toLowerCase();
        if (name.endsWith('.csv') || name.endsWith('.xlsx')) return cb(null, true);
        // .xls is the legacy binary format — exceljs only reads the modern
        // zip-based .xlsx, so say so instead of failing on a parse error later.
        if (name.endsWith('.xls')) {
            return cb(new Error('Old .xls files are not supported. Open it in Excel and "Save As" .xlsx, or export as CSV.'));
        }
        cb(new Error('Only .xlsx (Excel) and .csv files are allowed'));
    },
});

/** Load the company row plus the seat limit for the role being imported. */
async function loadCompanySeats(companyId, role) {
    const limitColumn = role === 'student' ? 'max_students' : 'max_teachers';
    const [[company]] = await pool.query(
        `SELECT c.id, c.status, c.company_name, sp.${limitColumn} AS seat_limit, sp.name AS plan_name
         FROM companies c JOIN subscription_plans sp ON c.subscription_plan_id = sp.id
         WHERE c.id = ?`,
        [companyId]
    );
    if (!company) return null;
    const [[{ used }]] = await pool.query(
        'SELECT COUNT(*) AS used FROM users WHERE company_id = ? AND role = ? AND is_active = TRUE',
        [companyId, role]
    );
    return { ...company, used, remaining: Math.max(0, company.seat_limit - used) };
}

const APPROVAL_GATE = {
    code: 'APPROVAL_REQUIRED',
    message: 'To protect student data, we manually review accounts before inviting real students. This usually takes under 24 hours.',
};

// ── POST /parse ─────────────────────────────────────────────────────────────
// Reads the uploaded roster and returns it for on-screen review. No writes.
router.post('/parse', authenticateToken, requireRole('company_admin'), requirePermission('students.add', 'teachers.add'), upload.single('file'), async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const type = req.body.type === 'teachers' ? 'teachers' : 'students';
        const role = type === 'students' ? 'student' : 'teacher';

        if (!req.file) return res.status(400).json({ message: 'An .xlsx or .csv file is required' });

        const seats = await loadCompanySeats(companyId, role);
        if (!seats) return res.status(400).json({ message: 'Company not found' });

        // Same gate as the single-student form. Checked here as well as on commit
        // so the admin finds out before filling in a screenful of logins.
        if (type === 'students' && seats.status === 'pending') {
            return res.status(403).json(APPROVAL_GATE);
        }

        let rawRows;
        try {
            rawRows = await readSheet(req.file.buffer, req.file.originalname);
        } catch (err) {
            return res.status(400).json({ message: `Could not read that file: ${err.message}` });
        }

        const { records, headerDetected, mapping, unknownColumns } = mapRows(rawRows, type);
        if (records.length === 0) {
            return res.status(400).json({ message: 'That file has no data rows.' });
        }
        if (records.length > MAX_ROWS) {
            return res.status(400).json({ message: `That file has ${records.length} rows. Please split it — ${MAX_ROWS} rows is the maximum per import.` });
        }
        if (mapping.name === undefined) {
            return res.status(400).json({ message: 'No "Name" column found. Add a Name column (it is the only required one) and upload again.' });
        }

        // Which of the emails in a teacher file are already taken — surfaced in
        // the preview so the admin can fix them before committing.
        let taken = new Set();
        if (type === 'teachers') {
            const emails = records.map(r => r.email.toLowerCase()).filter(Boolean);
            if (emails.length > 0) {
                const [rows] = await pool.query('SELECT LOWER(email) AS email FROM users WHERE email IN (?)', [emails]);
                taken = new Set(rows.map(r => r.email));
            }
        }

        const rows = [];
        const skipped = [];
        const seenEmails = new Set();

        for (const rec of records) {
            if (!rec.name) {
                skipped.push({ row: rec.row, reason: 'Name is empty' });
                continue;
            }
            if (type === 'students') {
                rows.push({
                    row: rec.row,
                    name: rec.name,
                    guardian_name: rec.guardian_name || '',
                    age: parseAge(rec.age),
                    nationality: rec.nationality || '',
                });
            } else {
                const email = rec.email.toLowerCase();
                const problems = [];
                if (!email) problems.push('Email is empty');
                else if (!isValidEmail(email)) problems.push('Email looks invalid');
                else if (taken.has(email)) problems.push('Email already registered');
                else if (seenEmails.has(email)) problems.push('Email repeated in this file');
                if (email) seenEmails.add(email);

                rows.push({
                    row: rec.row,
                    name: rec.name,
                    email,
                    // Generated here so the admin sees the real password in the
                    // preview and can copy it before the account exists.
                    password: generateTempPassword(),
                    problem: problems[0] || null,
                });
            }
        }

        res.json({
            type,
            rows,
            skipped,
            header_detected: headerDetected,
            columns_found: Object.keys(mapping),
            unknown_columns: unknownColumns,
            seats: { limit: seats.seat_limit, used: seats.used, remaining: seats.remaining, plan_name: seats.plan_name },
        });
    } catch (err) {
        console.error('Import parse error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

/** Shared logging/notification tail for a finished import. */
async function recordImport({ companyId, userId, type, total, created, failed }) {
    await pool.query(
        `INSERT INTO bulk_import_logs (company_id, imported_by, import_type, total_rows, success_count, skipped_count, error_details)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [companyId, userId, type, total, created, failed.length, failed.length > 0 ? JSON.stringify(failed) : null]
    );

    const [admins] = await pool.query(
        "SELECT id FROM users WHERE company_id = ? AND role = 'company_admin'",
        [companyId]
    );
    const label = type === 'students' ? 'Student' : 'Teacher';
    for (const admin of admins) {
        notify({
            userId: admin.id,
            companyId,
            type: 'bulk_import',
            title: `${label} import completed`,
            message: `${created} ${type} created${failed.length ? `, ${failed.length} skipped` : ''}.`,
            link: type === 'students' ? '/students' : '/admin/teachers',
        });
    }

    logAction(companyId, userId, `bulk_import_${type}`, 'import', null, { created, skipped: failed.length });
}

// ── POST /students ──────────────────────────────────────────────────────────
// Creates reviewed student accounts. Body: { students: [{ name, email,
// password, guardian_name, age, nationality }] }
router.post('/students', authenticateToken, requireRole('company_admin'), requirePermission('students.add'), async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const userId = req.user.id;
        const incoming = Array.isArray(req.body.students) ? req.body.students : null;

        if (!incoming || incoming.length === 0) {
            return res.status(400).json({ message: 'No students to create' });
        }
        if (incoming.length > MAX_ROWS) {
            return res.status(400).json({ message: `Too many rows — ${MAX_ROWS} is the maximum per import.` });
        }

        const seats = await loadCompanySeats(companyId, 'student');
        if (!seats) return res.status(400).json({ message: 'Company not found' });
        // The authoritative check. /parse gates early for the admin's benefit;
        // this is the one that actually protects the review.
        if (seats.status === 'pending') return res.status(403).json(APPROVAL_GATE);

        const emails = incoming.map(s => String(s.email || '').trim().toLowerCase()).filter(Boolean);
        let taken = new Set();
        if (emails.length > 0) {
            const [rows] = await pool.query('SELECT LOWER(email) AS email FROM users WHERE email IN (?)', [emails]);
            taken = new Set(rows.map(r => r.email));
        }

        const [[{ existingStudents }]] = await pool.query(
            "SELECT COUNT(*) AS existingStudents FROM users WHERE company_id = ? AND role = 'student' AND is_active = TRUE",
            [companyId]
        );

        const created = [];
        const failed = [];
        let seatsLeft = seats.remaining;

        for (const s of incoming) {
            const row = s.row ?? null;
            const name = String(s.name || '').trim();
            const email = String(s.email || '').trim().toLowerCase();
            const password = String(s.password || '');

            if (!name) { failed.push({ row, name, email, reason: 'Name is required' }); continue; }
            if (!email) { failed.push({ row, name, email, reason: 'Email is required' }); continue; }
            if (!isValidEmail(email)) { failed.push({ row, name, email, reason: 'Invalid email format' }); continue; }
            // No length floor here, unlike the self-service paths: these are
            // passwords an admin hands to a child, and short ones are a
            // deliberate choice. It still has to be non-empty — a blank would
            // otherwise create an account nobody can log into.
            if (!password) { failed.push({ row, name, email, reason: 'Password is required' }); continue; }
            if (taken.has(email)) { failed.push({ row, name, email, reason: 'Email already registered' }); continue; }
            if (seatsLeft <= 0) {
                failed.push({ row, name, email, reason: `Plan limit reached (${seats.seat_limit} students on ${seats.plan_name})` });
                continue;
            }

            // Optional columns: an empty cell saves nothing at all.
            const guardian = String(s.guardian_name || '').trim() || null;
            const nationality = String(s.nationality || '').trim() || null;
            const age = parseAge(s.age);

            try {
                const [result] = await pool.query(
                    `INSERT INTO users (company_id, role, name, email, password, guardian_name, nationality, age)
                     VALUES (?, 'student', ?, ?, ?, ?, ?, ?)`,
                    [companyId, name, email, password, guardian, nationality, age]
                );
                taken.add(email);   // blocks a duplicate later in the same payload
                seatsLeft--;
                created.push({ id: result.insertId, name, email, password, guardian_name: guardian, nationality, age });
                await logAction(companyId, userId, 'student_created', 'user', result.insertId, { name, email, via: 'bulk_import' });
            } catch (err) {
                // Covers the race where the same email is inserted concurrently.
                const duplicate = err.code === 'ER_DUP_ENTRY';
                failed.push({ row, name, email, reason: duplicate ? 'Email already registered' : 'Could not create this account' });
                if (!duplicate) console.error('Bulk student insert error:', err);
            }
        }

        // Funnel event for the first real student, matching POST /api/admin/students.
        if (existingStudents === 0 && created.length > 0) {
            await logAction(companyId, userId, 'onboarding_student_invited', 'user', created[0].id, {
                name: created[0].name, email: created[0].email, via: 'bulk_import',
            });
        }

        await recordImport({ companyId, userId, type: 'students', total: incoming.length, created: created.length, failed });

        res.status(created.length > 0 ? 201 : 400).json({
            created,
            failed,
            imported: created.length,
            skipped: failed.length,
            total: incoming.length,
        });
    } catch (err) {
        console.error('Bulk import students error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// ── POST /teachers ──────────────────────────────────────────────────────────
// Creates reviewed teacher accounts. Body: { teachers: [{ name, email,
// password? }] } — a missing password is generated, same as adding one by hand.
router.post('/teachers', authenticateToken, requireRole('company_admin'), requirePermission('teachers.add'), async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const userId = req.user.id;
        const incoming = Array.isArray(req.body.teachers) ? req.body.teachers : null;

        if (!incoming || incoming.length === 0) {
            return res.status(400).json({ message: 'No teachers to create' });
        }
        if (incoming.length > MAX_ROWS) {
            return res.status(400).json({ message: `Too many rows — ${MAX_ROWS} is the maximum per import.` });
        }

        const seats = await loadCompanySeats(companyId, 'teacher');
        if (!seats) return res.status(400).json({ message: 'Company not found' });

        const emails = incoming.map(t => String(t.email || '').trim().toLowerCase()).filter(Boolean);
        let taken = new Set();
        if (emails.length > 0) {
            const [rows] = await pool.query('SELECT LOWER(email) AS email FROM users WHERE email IN (?)', [emails]);
            taken = new Set(rows.map(r => r.email));
        }

        const [[{ existingTeachers }]] = await pool.query(
            "SELECT COUNT(*) AS existingTeachers FROM users WHERE company_id = ? AND role = 'teacher' AND is_active = TRUE",
            [companyId]
        );

        const frontend = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
        const loginUrl = `${frontend}/login`;
        const created = [];
        const failed = [];
        let seatsLeft = seats.remaining;

        for (const t of incoming) {
            const row = t.row ?? null;
            const name = String(t.name || '').trim();
            const email = String(t.email || '').trim().toLowerCase();
            const supplied = String(t.password || '').trim();

            if (!name) { failed.push({ row, name, email, reason: 'Name is required' }); continue; }
            if (!email) { failed.push({ row, name, email, reason: 'Email is required' }); continue; }
            if (!isValidEmail(email)) { failed.push({ row, name, email, reason: 'Invalid email format' }); continue; }
            // No length floor, matching the student path above: a password an
            // admin types on the review screen is their call. Left empty, one is
            // generated below.
            if (taken.has(email)) { failed.push({ row, name, email, reason: 'Email already registered' }); continue; }
            if (seatsLeft <= 0) {
                failed.push({ row, name, email, reason: `Plan limit reached (${seats.seat_limit} teachers on ${seats.plan_name})` });
                continue;
            }

            const password = supplied || generateTempPassword();

            try {
                const [result] = await pool.query(
                    "INSERT INTO users (company_id, role, name, email, password) VALUES (?, 'teacher', ?, ?, ?)",
                    [companyId, name, email, password]
                );
                taken.add(email);
                seatsLeft--;
                created.push({ id: result.insertId, name, email, password, login_url: loginUrl });
                await logAction(companyId, userId, 'teacher_added', 'user', result.insertId, { name, email, via: 'bulk_import' });

                // Best-effort invite. With SMTP unconfigured sendMail only logs,
                // which is why the credentials come back in the response for the
                // admin to copy — the same fallback the single-teacher form uses.
                sendMail({
                    to: email,
                    subject: `You've been invited to teach at ${seats.company_name || 'your school'}`,
                    html: `<h2>Hi ${name},</h2>
                           <p><strong>${seats.company_name || 'Your school'}</strong> has set up a Brightfolks account for you.</p>
                           <p><strong>Email:</strong> ${email}<br/>
                              <strong>Temporary password:</strong> ${password}</p>
                           <p><a href="${loginUrl}" style="display:inline-block;padding:10px 18px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none">Log in to Brightfolks</a></p>
                           <p style="color:#777;font-size:13px">You can change this password once you're in.</p>`,
                }).catch(() => {});
            } catch (err) {
                const duplicate = err.code === 'ER_DUP_ENTRY';
                failed.push({ row, name, email, reason: duplicate ? 'Email already registered' : 'Could not create this account' });
                if (!duplicate) console.error('Bulk teacher insert error:', err);
            }
        }

        // Matches POST /api/admin/teachers: the onboarding milestone measures the
        // company's very first teacher, so only fire when we just created them.
        if (existingTeachers === 0 && created.length > 0) {
            await logAction(companyId, userId, 'onboarding_teacher_added', 'user', created[0].id, {
                name: created[0].name, email: created[0].email, via: 'bulk_import',
            });
        }

        await recordImport({ companyId, userId, type: 'teachers', total: incoming.length, created: created.length, failed });

        res.status(created.length > 0 ? 201 : 400).json({
            created,
            failed,
            imported: created.length,
            skipped: failed.length,
            total: incoming.length,
            is_first_teacher: existingTeachers === 0 && created.length > 0,
        });
    } catch (err) {
        console.error('Bulk import teachers error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /logs — Import history
router.get('/logs', authenticateToken, requireRole('company_admin'), requirePermission('students.add', 'teachers.add'), async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const [rows] = await pool.query(
            `SELECT bil.*, u.name AS imported_by_name
             FROM bulk_import_logs bil
             JOIN users u ON bil.imported_by = u.id
             WHERE bil.company_id = ?
             ORDER BY bil.created_at DESC`,
            [companyId]
        );
        res.json(rows);
    } catch (err) {
        console.error('Import logs error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /template/:type — Download a CSV template with the expected columns.
// No password column by design: logins are set on the preview screen.
router.get('/template/:type', authenticateToken, requireRole('company_admin'), requirePermission('students.add', 'teachers.add'), (req, res) => {
    const { type } = req.params;
    const templates = {
        students: {
            header: ['Name', 'Guardian Name', 'Age', 'Nationality'],
            sample: ['Maria Santos', 'Ana Santos', '9', 'Philippines'],
        },
        teachers: {
            header: ['Name', 'Email'],
            sample: ['Jane Cruz', 'jane.cruz@example.com'],
        },
    };
    const template = templates[type];
    if (!template) return res.status(400).json({ message: 'Invalid type. Use "students" or "teachers".' });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${type}_template.csv"`);
    res.send(`${template.header.join(',')}\n${template.sample.join(',')}\n`);
});

// Multer rejections (file type, 5MB limit) arrive here as errors rather than as
// a normal response, so translate them into something the upload screen can show.
router.use((err, req, res, next) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'That file is larger than 5MB.' });
    }
    if (err instanceof multer.MulterError || /\.xlsx|\.csv|allowed/i.test(err.message || '')) {
        return res.status(400).json({ message: err.message });
    }
    next(err);
});

module.exports = router;
