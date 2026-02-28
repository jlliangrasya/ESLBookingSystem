const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

// PUBLIC: List subscription plans (for registration page)
router.get('/subscription-plans', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM subscription_plans ORDER BY price_monthly ASC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// PUBLIC: Register a new company (status: pending)
router.post('/register', async (req, res) => {
    try {
        const { name, email, phone, address, subscription_plan_id, owner_name, owner_email, owner_password } = req.body;

        if (!name || !email || !subscription_plan_id || !owner_name || !owner_email || !owner_password) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // Check company email uniqueness
        const [existingCompany] = await pool.query('SELECT id FROM companies WHERE email = ?', [email]);
        if (existingCompany.length > 0) {
            return res.status(400).json({ message: 'A company with this email is already registered' });
        }

        // Check owner email uniqueness
        const [existingUser] = await pool.query('SELECT id FROM users WHERE email = ?', [owner_email]);
        if (existingUser.length > 0) {
            return res.status(400).json({ message: 'Owner email is already registered' });
        }

        // Validate plan
        const [plan] = await pool.query('SELECT id FROM subscription_plans WHERE id = ?', [subscription_plan_id]);
        if (plan.length === 0) {
            return res.status(400).json({ message: 'Invalid subscription plan' });
        }

        // Create company (pending)
        const [result] = await pool.query(
            `INSERT INTO companies (name, email, phone, address, subscription_plan_id, status)
             VALUES (?, ?, ?, ?, ?, 'pending')`,
            [name, email, phone || null, address || null, subscription_plan_id]
        );
        const companyId = result.insertId;

        // Store owner details temporarily in users table with role=company_admin but suspended
        // They can't login until super_admin approves. We'll store their hashed password now.
        const hashedPassword = await bcrypt.hash(owner_password, 10);
        await pool.query(
            `INSERT INTO users (company_id, role, name, email, password) VALUES (?, 'company_admin', ?, ?, ?)`,
            [companyId, owner_name, owner_email, hashedPassword]
        );

        res.status(201).json({
            message: 'Registration submitted! Your application is pending approval. We will contact you by email.',
            company_id: companyId,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// SUPER ADMIN: List all companies
router.get('/', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT
                c.id, c.name, c.email, c.phone, c.address, c.status,
                c.created_at, c.approved_at,
                sp.name AS plan_name, sp.max_students, sp.price_monthly,
                approver.name AS approved_by_name,
                COUNT(DISTINCT u.id) AS total_users
            FROM companies c
            LEFT JOIN subscription_plans sp ON c.subscription_plan_id = sp.id
            LEFT JOIN users approver ON c.approved_by = approver.id
            LEFT JOIN users u ON u.company_id = c.id
            GROUP BY c.id
            ORDER BY c.created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// SUPER ADMIN: Approve a company
router.post('/:id/approve', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const superAdminId = req.user.id;

        const [company] = await pool.query('SELECT * FROM companies WHERE id = ?', [id]);
        if (company.length === 0) {
            return res.status(404).json({ message: 'Company not found' });
        }
        if (company[0].status === 'active') {
            return res.status(400).json({ message: 'Company is already active' });
        }

        await pool.query(
            `UPDATE companies SET status = 'active', approved_by = ?, approved_at = NOW() WHERE id = ?`,
            [superAdminId, id]
        );

        res.json({ message: `Company "${company[0].name}" approved successfully` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// SUPER ADMIN: Reject a company
router.post('/:id/reject', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const { id } = req.params;

        const [company] = await pool.query('SELECT * FROM companies WHERE id = ?', [id]);
        if (company.length === 0) {
            return res.status(404).json({ message: 'Company not found' });
        }

        await pool.query(`UPDATE companies SET status = 'rejected' WHERE id = ?`, [id]);

        res.json({ message: `Company "${company[0].name}" rejected` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// SUPER ADMIN: Suspend a company
router.post('/:id/suspend', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query(`UPDATE companies SET status = 'suspended' WHERE id = ?`, [id]);
        res.json({ message: 'Company suspended' });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

module.exports = router;
