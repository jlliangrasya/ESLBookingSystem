const express = require('express');
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const notify = require('../utils/notify');
const jwt = require('jsonwebtoken');
const { logAction } = require('../utils/audit');

const router = express.Router();

// PUBLIC: List subscription plans (for registration page)
router.get('/subscription-plans', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM subscription_plans WHERE is_active = TRUE ORDER BY price_monthly ASC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// PUBLIC: Register a new company (status: pending)
router.post('/register', async (req, res) => {
    const { name, email, phone, address, subscription_plan_id, owner_name, owner_email, owner_password } = req.body;

    if (!name || !email || !subscription_plan_id || !owner_name || !owner_email || !owner_password) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [[existingCompany]] = await connection.query('SELECT id FROM companies WHERE email = ?', [email]);
        if (existingCompany) {
            await connection.rollback();
            return res.status(400).json({ message: 'A company with this email is already registered' });
        }

        const [[sameName]] = await connection.query('SELECT id FROM companies WHERE LOWER(name) = LOWER(?)', [name]);
        if (sameName) {
            await connection.rollback();
            return res.status(400).json({ message: 'A company with this name is already registered' });
        }

        const [[existingUser]] = await connection.query('SELECT id FROM users WHERE email = ?', [owner_email]);
        if (existingUser) {
            await connection.rollback();
            return res.status(400).json({ message: 'Owner email is already registered' });
        }

        const [[plan]] = await connection.query('SELECT * FROM subscription_plans WHERE id = ?', [subscription_plan_id]);
        if (!plan) {
            await connection.rollback();
            return res.status(400).json({ message: 'Invalid subscription plan' });
        }

        const [result] = await connection.query(
            `INSERT INTO companies (name, email, phone, address, subscription_plan_id, status)
             VALUES (?, ?, ?, ?, ?, 'pending')`,
            [name, email, phone || null, address || null, subscription_plan_id]
        );
        const companyId = result.insertId;

        const [ownerResult] = await connection.query(
            `INSERT INTO users (company_id, role, name, email, password, is_owner) VALUES (?, 'company_admin', ?, ?, ?, TRUE)`,
            [companyId, owner_name, owner_email, owner_password]
        );
        await connection.query(
            `INSERT INTO admin_permissions (user_id, can_add_teacher, can_edit_teacher, can_delete_teacher)
             VALUES (?, TRUE, TRUE, TRUE)`,
            [ownerResult.insertId]
        );

        await connection.commit();

        // Notify all super_admins (fire-and-forget, after commit)
        const [superAdmins] = await pool.query('SELECT id FROM users WHERE role = ?', ['super_admin']);
        await Promise.all(superAdmins.map(sa => notify({
            userId: sa.id,
            companyId: null,
            type: 'new_company',
            title: 'New company registered',
            message: `"${name}" applied for a ${plan.name} plan and is awaiting approval.`,
        })));

        res.status(201).json({
            message: 'Registration submitted! Your application is pending approval.',
            company_id: companyId,
        });
    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    } finally {
        connection.release();
    }
});

// SUPER ADMIN: List all companies
router.get('/', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT
                c.id, c.name, c.email, c.phone, c.address, c.status,
                c.created_at, c.approved_at, c.trial_ends_at,
                c.next_due_date, c.last_paid_at,
                sp.name AS plan_name, sp.max_students, sp.max_teachers, sp.price_monthly,
                approver.name AS approved_by_name,
                (SELECT COUNT(*) FROM users WHERE company_id = c.id AND role = 'student') AS student_count,
                (SELECT COUNT(*) FROM users WHERE company_id = c.id AND role = 'teacher') AS teacher_count,
                (SELECT COUNT(*) FROM bookings WHERE company_id = c.id
                 AND YEARWEEK(appointment_date, 1) = YEARWEEK(CURDATE(), 1)
                 AND status IN ('pending', 'confirmed')) AS weekly_classes
            FROM companies c
            LEFT JOIN subscription_plans sp ON c.subscription_plan_id = sp.id
            LEFT JOIN users approver ON c.approved_by = approver.id
            ORDER BY c.created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// SUPER ADMIN: Approve a company
router.post('/:id/approve', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const superAdminId = req.user.id;

        const [[company]] = await pool.query(
            `SELECT c.*, sp.name AS plan_name
             FROM companies c JOIN subscription_plans sp ON c.subscription_plan_id = sp.id
             WHERE c.id = ?`,
            [id]
        );
        if (!company) return res.status(404).json({ message: 'Company not found' });
        if (company.status === 'active') return res.status(400).json({ message: 'Company is already active' });

        const isTrial = company.plan_name === 'Free Trial';
        if (isTrial) {
            await pool.query(
                `UPDATE companies SET status = 'active', approved_by = ?, approved_at = NOW(),
                 trial_ends_at = DATE_ADD(NOW(), INTERVAL 30 DAY) WHERE id = ?`,
                [superAdminId, id]
            );
        } else {
            await pool.query(
                `UPDATE companies SET status = 'active', approved_by = ?, approved_at = NOW(),
                 next_due_date = DATE_ADD(NOW(), INTERVAL 1 MONTH) WHERE id = ?`,
                [superAdminId, id]
            );
        }

        // Notify company_admin
        const [[admin]] = await pool.query(
            'SELECT id FROM users WHERE company_id = ? AND role = ?', [id, 'company_admin']
        );
        if (admin) {
            await notify({
                userId: admin.id,
                companyId: Number(id),
                type: 'company_approved',
                title: 'Company approved!',
                message: isTrial
                    ? 'Your company has been approved. Your 30-day free trial starts now.'
                    : 'Your company has been approved. You can now log in.',
            });
        }

        await logAction(null, superAdminId, 'company_approved', 'company', Number(id), { company_name: company.name, plan: company.plan_name });
        res.json({ message: `Company "${company.name}" approved successfully` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// SUPER ADMIN: Reject a company
router.post('/:id/reject', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const { id } = req.params;

        const [[company]] = await pool.query('SELECT * FROM companies WHERE id = ?', [id]);
        if (!company) return res.status(404).json({ message: 'Company not found' });

        await pool.query(`UPDATE companies SET status = 'rejected' WHERE id = ?`, [id]);

        const [[admin]] = await pool.query(
            'SELECT id FROM users WHERE company_id = ? AND role = ?', [id, 'company_admin']
        );
        if (admin) {
            await notify({
                userId: admin.id,
                companyId: Number(id),
                type: 'company_rejected',
                title: 'Company registration rejected',
                message: 'Your company registration was not approved. Contact support for more information.',
            });
        }

        await logAction(null, req.user.id, 'company_rejected', 'company', Number(id), { company_name: company.name });
        res.json({ message: `Company "${company.name}" rejected` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// SUPER ADMIN: Suspend a company
router.post('/:id/suspend', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query(`UPDATE companies SET status = 'suspended' WHERE id = ?`, [id]);
        await logAction(null, req.user.id, 'company_suspended', 'company', Number(id), {});
        res.json({ message: 'Company suspended' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// SUPER ADMIN: Reactivate a suspended company
router.post('/:id/reactivate', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query(`UPDATE companies SET status = 'active' WHERE id = ?`, [id]);
        res.json({ message: 'Company reactivated' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// SUPER ADMIN: Lock a company (non-payment)
router.post('/:id/lock', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const [[company]] = await pool.query('SELECT name FROM companies WHERE id = ?', [id]);
        if (!company) return res.status(404).json({ message: 'Company not found' });

        await pool.query("UPDATE companies SET status = 'locked' WHERE id = ?", [id]);

        const [[owner]] = await pool.query(
            "SELECT id FROM users WHERE company_id = ? AND role = 'company_admin' AND is_owner = TRUE LIMIT 1", [id]
        );
        if (owner) {
            await notify({
                userId: owner.id, companyId: Number(id),
                type: 'account_locked',
                title: 'Account locked',
                message: 'Your company account has been locked. Please contact support to resolve your payment and restore access.',
            });
        }
        await logAction(null, req.user.id, 'company_locked', 'company', Number(id), { company_name: company.name });
        res.json({ message: 'Company locked' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// SUPER ADMIN: Unlock a company
router.post('/:id/unlock', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query("UPDATE companies SET status = 'active' WHERE id = ?", [id]);

        const [[owner]] = await pool.query(
            "SELECT id FROM users WHERE company_id = ? AND role = 'company_admin' AND is_owner = TRUE LIMIT 1", [id]
        );
        if (owner) {
            await notify({
                userId: owner.id, companyId: Number(id),
                type: 'account_unlocked',
                title: 'Account restored',
                message: 'Your company account has been unlocked. You can now access your dashboard.',
            });
        }
        res.json({ message: 'Company unlocked' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// SUPER ADMIN: Mark subscription as paid — extends next_due_date by 1 month
router.post('/:id/mark-paid', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const [[company]] = await pool.query('SELECT name, next_due_date FROM companies WHERE id = ?', [id]);
        if (!company) return res.status(404).json({ message: 'Company not found' });

        await pool.query(
            `UPDATE companies SET last_paid_at = NOW(),
             next_due_date = DATE_ADD(COALESCE(next_due_date, CURDATE()), INTERVAL 1 MONTH)
             WHERE id = ?`,
            [id]
        );

        const [[owner]] = await pool.query(
            "SELECT id FROM users WHERE company_id = ? AND role = 'company_admin' AND is_owner = TRUE LIMIT 1", [id]
        );
        if (owner) {
            await notify({
                userId: owner.id, companyId: Number(id),
                type: 'payment_confirmed',
                title: 'Payment confirmed',
                message: 'Your subscription payment has been confirmed. Your account is active for another month.',
            });
        }
        res.json({ message: 'Payment marked, subscription extended by 1 month' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// COMPANY ADMIN (trial expired): Submit upgrade request
router.post('/upgrade-request', authenticateToken.basic, requireRole('company_admin'), async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const { subscription_plan_id, reference_number, contact_name, contact_email } = req.body;

        if (!subscription_plan_id) {
            return res.status(400).json({ message: 'subscription_plan_id is required' });
        }

        // Check for existing pending request
        const [[existing]] = await pool.query(
            "SELECT id FROM upgrade_requests WHERE company_id = ? AND status = 'pending'",
            [companyId]
        );
        if (existing) {
            return res.status(400).json({ message: 'You already have a pending upgrade request' });
        }

        await pool.query(
            `INSERT INTO upgrade_requests (company_id, subscription_plan_id, notes) VALUES (?, ?, ?)`,
            [companyId, subscription_plan_id, JSON.stringify({ reference_number, contact_name, contact_email })]
        );

        // Notify super_admins
        const [superAdmins] = await pool.query("SELECT id FROM users WHERE role = 'super_admin'");
        const [[company]] = await pool.query('SELECT name FROM companies WHERE id = ?', [companyId]);
        const [[plan]] = await pool.query('SELECT name FROM subscription_plans WHERE id = ?', [subscription_plan_id]);
        await Promise.all(superAdmins.map(sa => notify({
            userId: sa.id,
            companyId: null,
            type: 'upgrade_request',
            title: 'Plan upgrade request',
            message: `"${company?.name}" has requested an upgrade to the ${plan?.name} plan.`,
        })));

        res.status(201).json({ message: 'Upgrade request submitted. Awaiting super admin approval.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// COMPANY ADMIN (trial expired): Check own upgrade request status
router.get('/upgrade-request/status', authenticateToken.basic, requireRole('company_admin'), async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const [[request]] = await pool.query(
            `SELECT ur.*, sp.name AS plan_name
             FROM upgrade_requests ur
             JOIN subscription_plans sp ON ur.subscription_plan_id = sp.id
             WHERE ur.company_id = ?
             ORDER BY ur.created_at DESC LIMIT 1`,
            [companyId]
        );
        res.json(request || null);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
