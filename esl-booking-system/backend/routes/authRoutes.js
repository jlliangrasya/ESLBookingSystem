const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
require('dotenv').config();

const router = express.Router();

// User Registration
router.post('/register', async (req, res) => {
    try {
        const { student_name, email, password, guardian_name, nationality, age, is_admin } = req.body;

        // Check if email already exists
        const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ message: 'Email already registered' });
        }

        // Prevent multiple admin accounts
        if (is_admin) {
            const adminCheck = await pool.query('SELECT * FROM users WHERE is_admin = TRUE');
            if (adminCheck.rows.length > 0) {
                return res.status(403).json({ message: 'Admin account already exists' });
            }
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert user into database
        const newUser = await pool.query(
            `INSERT INTO users (student_name, email, password, guardian_name, nationality, age, is_admin) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) 
             RETURNING id, student_name, email, nationality, age, is_admin`,
            [student_name, email, hashedPassword, guardian_name || null, nationality || null, age || null, is_admin || false]
        );

        res.status(201).json({ message: 'User registered successfully', user: newUser.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// User Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log("Login Attempt:", email);

        // Check if user exists
        const userQuery = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userQuery.rows.length === 0) {
            console.log("User Not Found:", email);
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        const user = userQuery.rows[0];

        // Compare passwords
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            console.log("Password Mismatch for:", email);
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: user.id, isAdmin: user.is_admin },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );
        console.log("Generated Token:", token);

        res.json({ 
            token, 
            user: { id: user.id, student_name: user.student_name, nationality: user.nationality, age: user.age, isAdmin: user.is_admin } 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

module.exports = router;
