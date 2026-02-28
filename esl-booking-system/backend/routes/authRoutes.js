const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
require('dotenv').config();

const router = express.Router();

// Register (student, teacher, or company_admin created by system)
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, guardian_name, nationality, age, role, company_id } = req.body;

        if (!name || !email || !password || !role) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // Only student and teacher can self-register under a company
        const selfRegisterRoles = ['student', 'teacher'];
        if (!selfRegisterRoles.includes(role)) {
            return res.status(403).json({ message: 'Invalid role for self-registration' });
        }

        if (!company_id) {
            return res.status(400).json({ message: 'company_id is required' });
        }

        // Check the company is active
        const [companyRows] = await pool.query(
            'SELECT id FROM companies WHERE id = ? AND status = ?',
            [company_id, 'active']
        );
        if (companyRows.length === 0) {
            return res.status(400).json({ message: 'Company not found or not active' });
        }

        // Check email uniqueness
        const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({ message: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await pool.query(
            `INSERT INTO users (company_id, role, name, email, password, guardian_name, nationality, age)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [company_id, role, name, email, hashedPassword,
             guardian_name || null, nationality || null, age || null]
        );

        const [newUser] = await pool.query(
            'SELECT id, company_id, role, name, email FROM users WHERE email = ?',
            [email]
        );

        res.status(201).json({ message: 'User registered successfully', user: newUser[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const [userQuery] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (userQuery.length === 0) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        const user = userQuery[0];

        // If company_admin or teacher/student, verify their company is active
        if (user.role !== 'super_admin' && user.company_id) {
            const [companyRows] = await pool.query(
                'SELECT status FROM companies WHERE id = ?',
                [user.company_id]
            );
            if (companyRows.length === 0 || companyRows[0].status !== 'active') {
                return res.status(403).json({ message: 'Your company account is not active' });
            }
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        const token = jwt.sign(
            { id: user.id, role: user.role, company_id: user.company_id },
            process.env.JWT_SECRET,
            { expiresIn: process.env.NODE_ENV === 'production' ? '1h' : '30d' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                role: user.role,
                company_id: user.company_id,
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

module.exports = router;
