const express = require('express');
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');

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
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// List all subscription plans (for super_admin management)
router.get('/plans', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM subscription_plans ORDER BY price_monthly ASC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

module.exports = router;
