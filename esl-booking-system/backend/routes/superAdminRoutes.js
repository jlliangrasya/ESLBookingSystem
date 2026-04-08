const express = require('express');
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');
const { invalidateAuthCache } = authenticateToken;
const requireRole = require('../middleware/requireRole');
const notify = require('../utils/notify');

const router = express.Router();

// Super admin dashboard stats
router.get('/dashboard', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const [[{ total_companies }]] = await pool.query('SELECT COUNT(*) AS total_companies FROM companies');
        const [[{ active_companies }]] = await pool.query("SELECT COUNT(*) AS active_companies FROM companies WHERE status = 'active'");
        const [[{ pending_companies }]] = await pool.query("SELECT COUNT(*) AS pending_companies FROM companies WHERE status = 'pending'");
        const [[{ total_students }]] = await pool.query("SELECT COUNT(*) AS total_students FROM users WHERE role = 'student'");
        const [[{ total_teachers }]] = await pool.query("SELECT COUNT(*) AS total_teachers FROM users WHERE role = 'teacher'");

        res.json({
            total_companies,
            active_companies,
            pending_companies,
            total_students,
            total_teachers,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// List all subscription plans (for super_admin management)
router.get('/plans', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT sp.*,
                   (SELECT COUNT(*) FROM companies c WHERE c.subscription_plan_id = sp.id AND c.status = 'active') AS company_count
            FROM subscription_plans sp
            ORDER BY sp.price_monthly ASC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Create a new subscription plan
router.post('/plans', authenticateToken, requireRole('super_admin'), async (req, res) => {
    const { name, max_students, max_teachers, max_admins, price_monthly, description } = req.body;
    if (!name || !max_students || !max_teachers || price_monthly === undefined)
        return res.status(400).json({ message: 'Missing required fields' });
    try {
        const [result] = await pool.query(
            'INSERT INTO subscription_plans (name, max_students, max_teachers, max_admins, price_monthly, description) VALUES (?, ?, ?, ?, ?, ?)',
            [name, max_students, max_teachers, max_admins ?? 5, price_monthly, description || null]
        );
        res.status(201).json({ message: 'Plan created', id: result.insertId });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Update a subscription plan
router.put('/plans/:id', authenticateToken, requireRole('super_admin'), async (req, res) => {
    const { name, max_students, max_teachers, max_admins, price_monthly, description } = req.body;
    try {
        await pool.query(
            'UPDATE subscription_plans SET name=?, max_students=?, max_teachers=?, max_admins=?, price_monthly=?, description=? WHERE id=?',
            [name, max_students, max_teachers, max_admins ?? 5, price_monthly, description || null, req.params.id]
        );
        res.json({ message: 'Plan updated' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Disable a subscription plan (warns if companies are using it)
router.post('/plans/:id/disable', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const [[{ activeCount }]] = await pool.query(
            "SELECT COUNT(*) AS activeCount FROM companies WHERE subscription_plan_id = ? AND status = 'active'",
            [id]
        );
        await pool.query('UPDATE subscription_plans SET is_active = FALSE WHERE id = ?', [id]);
        const warning = activeCount > 0 ? ` Warning: ${activeCount} active company(ies) are still on this plan.` : '';
        res.json({ message: `Plan disabled.${warning}`, active_companies_affected: activeCount });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Enable a subscription plan
router.post('/plans/:id/enable', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        await pool.query('UPDATE subscription_plans SET is_active = TRUE WHERE id = ?', [req.params.id]);
        res.json({ message: 'Plan enabled' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// List upgrade requests
router.get('/upgrade-requests', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT ur.id, ur.status, ur.created_at, ur.notes,
                   c.company_name, c.company_email,
                   sp_old.name AS current_plan,
                   sp_new.name AS requested_plan, sp_new.price_monthly
            FROM upgrade_requests ur
            JOIN companies c ON ur.company_id = c.id
            LEFT JOIN subscription_plans sp_old ON c.subscription_plan_id = sp_old.id
            JOIN subscription_plans sp_new ON ur.subscription_plan_id = sp_new.id
            ORDER BY ur.created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Approve upgrade request
router.post('/upgrade-requests/:id/approve', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const superAdminId = req.user.id;

        const [[request]] = await pool.query(
            'SELECT * FROM upgrade_requests WHERE id = ?', [id]
        );
        if (!request) return res.status(404).json({ message: 'Request not found' });
        if (request.status !== 'pending') return res.status(400).json({ message: 'Request already processed' });

        const [[plan]] = await pool.query('SELECT * FROM subscription_plans WHERE id = ?', [request.subscription_plan_id]);
        if (!plan) return res.status(400).json({ message: 'Requested plan no longer exists. Please reject this request.' });
        if (!plan.is_active) return res.status(400).json({ message: 'Requested plan has been disabled. Please reject this request.' });

        // Activate company with new plan, clear trial, set billing cycle
        await pool.query(
            `UPDATE companies SET subscription_plan_id = ?, trial_ends_at = NULL, status = 'active',
             approved_by = ?, approved_at = NOW(),
             next_due_date = DATE_ADD(NOW(), INTERVAL 1 MONTH) WHERE id = ?`,
            [request.subscription_plan_id, superAdminId, request.company_id]
        );

        // Mark request approved
        await pool.query(
            "UPDATE upgrade_requests SET status = 'approved', processed_by = ?, processed_at = NOW() WHERE id = ?",
            [superAdminId, id]
        );

        // Auto-create company_payments record from the upgrade request
        const refNotes = request.notes ? (() => { try { const p = JSON.parse(request.notes); return `Ref: ${p.reference_number || ''} | ${p.contact_name || ''}`; } catch { return request.notes; } })() : null;
        await pool.query(
            `INSERT INTO company_payments (company_id, amount, payment_date, period_start, period_end, notes, recorded_by)
             VALUES (?, ?, CURDATE(), CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 MONTH), ?, ?)`,
            [request.company_id, plan.price_monthly, refNotes, superAdminId]
        );

        // Notify company admin
        const [[admin]] = await pool.query(
            "SELECT id FROM users WHERE company_id = ? AND role = 'company_admin' LIMIT 1",
            [request.company_id]
        );
        if (admin) {
            await notify({
                userId: admin.id,
                companyId: request.company_id,
                type: 'upgrade_approved',
                title: 'Company approved!',
                message: `Your subscription to the ${plan.name} plan has been approved. You can now access your dashboard.`,
            });
        }

        res.json({ message: 'Upgrade approved successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Reject upgrade request
router.post('/upgrade-requests/:id/reject', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const superAdminId = req.user.id;

        const [[request]] = await pool.query('SELECT * FROM upgrade_requests WHERE id = ?', [id]);
        if (!request) return res.status(404).json({ message: 'Request not found' });

        await pool.query(
            "UPDATE upgrade_requests SET status = 'rejected', processed_by = ?, processed_at = NOW() WHERE id = ?",
            [superAdminId, id]
        );

        const [[admin]] = await pool.query(
            "SELECT id FROM users WHERE company_id = ? AND role = 'company_admin' LIMIT 1",
            [request.company_id]
        );
        if (admin) {
            await notify({
                userId: admin.id,
                companyId: request.company_id,
                type: 'upgrade_rejected',
                title: 'Upgrade request rejected',
                message: 'Your plan upgrade request was not approved. Please contact support or submit a new request.',
            });
        }

        res.json({ message: 'Upgrade request rejected' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/super-admin/analytics
router.get('/analytics', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        // Company growth (new companies per month, last 6 months)
        const [companyGrowth] = await pool.query(
            `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS new_companies
             FROM companies
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
             GROUP BY month ORDER BY month ASC`
        );

        // Active companies by plan
        const [byPlan] = await pool.query(
            `SELECT sp.name AS plan_name, COUNT(*) AS company_count
             FROM companies c
             JOIN subscription_plans sp ON c.subscription_plan_id = sp.id
             WHERE c.status = 'active'
             GROUP BY sp.id, sp.name ORDER BY company_count DESC`
        );

        // Sessions across all companies (last 6 months)
        const [sessionsOverall] = await pool.query(
            `SELECT DATE_FORMAT(appointment_date, '%Y-%m') AS month,
                    COUNT(*) AS total,
                    SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS completed
             FROM bookings
             WHERE appointment_date >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
             GROUP BY month ORDER BY month ASC`
        );

        // Totals
        const [[totals]] = await pool.query(
            `SELECT
               (SELECT COUNT(*) FROM companies WHERE status = 'active') AS active_companies,
               (SELECT COUNT(*) FROM companies WHERE status = 'pending') AS pending_companies,
               (SELECT COUNT(*) FROM users WHERE role = 'student') AS total_students,
               (SELECT COUNT(*) FROM users WHERE role = 'teacher') AS total_teachers,
               (SELECT COUNT(*) FROM bookings WHERE status = 'done') AS total_sessions`
        );

        res.json({ companyGrowth, byPlan, sessionsOverall, totals });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/super-admin/companies/:id/profile — detailed company profile
router.get('/companies/:id/profile', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const { id } = req.params;

        const [[company]] = await pool.query(`
            SELECT c.*,
                   sp.name AS plan_name, sp.price_monthly, sp.max_students, sp.max_teachers, sp.max_admins,
                   u_approved.name AS approved_by_name,
                   (SELECT COUNT(*) FROM users WHERE company_id = c.id AND role = 'student') AS student_count,
                   (SELECT COUNT(*) FROM users WHERE company_id = c.id AND role = 'teacher') AS teacher_count,
                   (SELECT COUNT(*) FROM bookings WHERE company_id = c.id AND status = 'done') AS completed_classes
            FROM companies c
            JOIN subscription_plans sp ON c.subscription_plan_id = sp.id
            LEFT JOIN users u_approved ON c.approved_by = u_approved.id
            WHERE c.id = ?
        `, [id]);

        if (!company) return res.status(404).json({ message: 'Company not found' });

        const [users] = await pool.query(`
            SELECT id, name, email, role, is_owner,
                   COALESCE(is_active, 1) AS is_active,
                   timezone, created_at
            FROM users
            WHERE company_id = ?
            ORDER BY FIELD(role,'company_admin','teacher','student'), name ASC
        `, [id]);

        res.json({ company, users });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/super-admin/all-users — every user across all companies (excluding super_admin)
router.get('/all-users', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT u.id, u.name, u.email, u.role, u.is_owner,
                   COALESCE(u.is_active, 1) AS is_active,
                   u.created_at,
                   c.company_name, c.id AS company_id
            FROM users u
            LEFT JOIN companies c ON u.company_id = c.id
            WHERE u.role != 'super_admin'
            ORDER BY c.company_name ASC, FIELD(u.role,'company_admin','teacher','student'), u.name ASC
        `);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// PATCH /api/super-admin/users/:id/toggle-status — activate / deactivate any user
router.patch('/users/:id/toggle-status', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const [[user]] = await pool.query('SELECT id, is_active FROM users WHERE id = ?', [id]);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const newStatus = user.is_active ? 0 : 1;
        await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [newStatus, id]);
        res.json({ message: newStatus ? 'Account activated' : 'Account deactivated', is_active: newStatus });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/super-admin/companies/:id/payments — full payment history for one company
router.get('/companies/:id/payments', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const [payments] = await pool.query(`
            SELECT cp.id, cp.amount, cp.payment_date, cp.period_start, cp.period_end,
                   cp.notes, cp.created_at,
                   u.name AS recorded_by_name
            FROM company_payments cp
            LEFT JOIN users u ON cp.recorded_by = u.id
            WHERE cp.company_id = ?
            ORDER BY cp.payment_date DESC
        `, [id]);
        res.json(payments);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/super-admin/backup-logs — list backup log entries (paginated)
router.get('/backup-logs', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const offset = parseInt(req.query.offset) || 0;

        const [rows] = await pool.query(
            `SELECT id, backup_type, status, details, created_at
             FROM backup_logs
             ORDER BY created_at DESC
             LIMIT ? OFFSET ?`,
            [limit, offset]
        );
        const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM backup_logs');
        res.json({ logs: rows, total });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/super-admin/backup-logs — record a manual backup entry
router.post('/backup-logs', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const { backup_type = 'manual', status = 'success', details } = req.body;
        if (!['manual', 'scheduled', 'export'].includes(backup_type))
            return res.status(400).json({ message: 'Invalid backup_type' });
        if (!['success', 'failed'].includes(status))
            return res.status(400).json({ message: 'Invalid status' });

        const [result] = await pool.query(
            'INSERT INTO backup_logs (backup_type, status, details) VALUES (?, ?, ?)',
            [backup_type, status, details ? JSON.stringify(details) : null]
        );
        res.status(201).json({ message: 'Backup logged', id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/super-admin/audit-logs — all companies (super admin view)
router.get('/audit-logs', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const offset = parseInt(req.query.offset) || 0;
        const companyFilter = req.query.company_id ? parseInt(req.query.company_id) : null;

        const whereClause = companyFilter ? 'WHERE al.company_id = ?' : '';
        const params = companyFilter ? [limit, offset] : [limit, offset];
        if (companyFilter) params.unshift(companyFilter);

        const [rows] = await pool.query(
            `SELECT al.id, al.action, al.target_type, al.target_id, al.details, al.created_at,
                    u.name AS user_name, u.role AS user_role,
                    c.company_name
             FROM audit_logs al
             LEFT JOIN users u ON al.user_id = u.id
             LEFT JOIN companies c ON al.company_id = c.id
             ${whereClause}
             ORDER BY al.created_at DESC
             LIMIT ? OFFSET ?`,
            params
        );

        res.json({ logs: rows });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// ——— Super Admin: User Management ———

// List all users (with search/filter)
router.get('/users', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const { search, role, company_id, is_active } = req.query;
        let query = `SELECT u.id, u.name, u.email, u.role, u.is_active, u.company_id, u.created_at,
                            c.company_name
                     FROM users u LEFT JOIN companies c ON u.company_id = c.id WHERE 1=1`;
        const params = [];
        if (search) { query += ' AND (u.name LIKE ? OR u.email LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
        if (role) { query += ' AND u.role = ?'; params.push(role); }
        if (company_id) { query += ' AND u.company_id = ?'; params.push(company_id); }
        if (is_active !== undefined) { query += ' AND u.is_active = ?'; params.push(is_active === 'true' ? 1 : 0); }
        query += ' ORDER BY u.created_at DESC LIMIT 100';
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Deactivate any user (super_admin)
router.post('/users/:id/deactivate', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const [[user]] = await pool.query('SELECT id, name, role FROM users WHERE id = ?', [id]);
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (user.role === 'super_admin') return res.status(403).json({ message: 'Cannot deactivate a super admin' });
        await pool.query('UPDATE users SET is_active = FALSE WHERE id = ?', [id]);
        res.json({ message: `${user.name} has been deactivated` });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Reactivate any user (super_admin)
router.post('/users/:id/reactivate', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const [[user]] = await pool.query('SELECT id, name FROM users WHERE id = ?', [id]);
        if (!user) return res.status(404).json({ message: 'User not found' });
        await pool.query('UPDATE users SET is_active = TRUE WHERE id = ?', [id]);
        res.json({ message: `${user.name} has been reactivated` });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Hard delete any user (super_admin only — permanent, use with caution)
// Wrapped in transaction to prevent partial deletion.
router.delete('/users/:id', authenticateToken, requireRole('super_admin'), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { id } = req.params;
        const [[user]] = await connection.query('SELECT id, name, role, company_id FROM users WHERE id = ?', [id]);
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (user.role === 'super_admin') return res.status(403).json({ message: 'Cannot delete a super admin' });

        await connection.beginTransaction();

        // Clean up related data (complete cascade)
        // Order matters: delete child records before parent records
        await connection.query('DELETE FROM notifications WHERE user_id = ?', [id]);
        await connection.query('DELETE FROM admin_permissions WHERE user_id = ?', [id]);
        await connection.query('DELETE FROM class_reports WHERE booking_id IN (SELECT b.id FROM bookings b JOIN student_packages sp ON b.student_package_id = sp.id WHERE sp.student_id = ?)', [id]);
        await connection.query('DELETE FROM class_reports WHERE teacher_id = ?', [id]);
        // session_adjustments references student_packages — must delete BEFORE student_packages
        await connection.query('DELETE FROM session_adjustments WHERE student_package_id IN (SELECT id FROM student_packages WHERE student_id = ?)', [id]);
        await connection.query('DELETE FROM session_adjustments WHERE adjusted_by = ?', [id]);
        await connection.query('DELETE FROM bookings WHERE student_package_id IN (SELECT id FROM student_packages WHERE student_id = ?)', [id]);
        await connection.query('DELETE FROM bookings WHERE teacher_id = ?', [id]);
        await connection.query('DELETE FROM student_packages WHERE student_id = ?', [id]);
        await connection.query('DELETE FROM student_feedback WHERE student_id = ?', [id]);
        await connection.query('DELETE FROM student_feedback WHERE teacher_id = ?', [id]);
        await connection.query('DELETE FROM teacher_leaves WHERE teacher_id = ?', [id]);
        await connection.query('DELETE FROM teacher_available_slots WHERE teacher_id = ?', [id]);
        await connection.query('DELETE FROM closed_slots WHERE teacher_id = ?', [id]);
        await connection.query('DELETE FROM waitlist WHERE student_id = ? OR teacher_id = ?', [id, id]);
        await connection.query('UPDATE company_payments SET recorded_by = NULL WHERE recorded_by = ?', [id]);
        await connection.query('UPDATE upgrade_requests SET processed_by = NULL WHERE processed_by = ?', [id]);
        await connection.query('DELETE FROM users WHERE id = ?', [id]);

        await connection.commit();

        // Audit log (after commit, using pool — not part of transaction)
        const { logAction } = require('../utils/audit');
        await logAction(user.company_id, req.user.id, 'user_hard_deleted', 'user', Number(id), {
            deleted_name: user.name, deleted_role: user.role,
        });

        res.json({ message: `${user.name} (${user.role}) has been permanently deleted` });
    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    } finally {
        connection.release();
    }
});

module.exports = router;
