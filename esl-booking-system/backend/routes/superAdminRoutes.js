const express = require('express');
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');
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
        const [rows] = await pool.query('SELECT * FROM subscription_plans ORDER BY price_monthly ASC');
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

// Disable a subscription plan
router.post('/plans/:id/disable', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        await pool.query('UPDATE subscription_plans SET is_active = FALSE WHERE id = ?', [req.params.id]);
        res.json({ message: 'Plan disabled' });
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
                   c.name AS company_name, c.email AS company_email,
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
                title: 'Plan upgrade approved!',
                message: `Your account has been upgraded to the ${plan.name} plan. You can now access your dashboard.`,
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
                    c.name AS company_name
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

module.exports = router;
