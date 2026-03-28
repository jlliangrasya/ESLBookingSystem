const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const notify = require('../utils/notify');
const { sendMail } = require('../utils/mailer');
require('dotenv').config();

const router = express.Router();

// Rate limiters for sensitive auth endpoints (login is intentionally unlimited)
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20,
    message: { message: 'Too many registration attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const forgotPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    message: { message: 'Too many password reset requests. Please try again in an hour.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Register (student or teacher — self-registration under an active company)
router.post('/register', registerLimiter, async (req, res) => {
    try {
        const { name, email, password, guardian_name, nationality, age, role, company_id } = req.body;

        if (!name || !email || !password || !role) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const selfRegisterRoles = ['student', 'teacher'];
        if (!selfRegisterRoles.includes(role)) {
            return res.status(403).json({ message: 'Invalid role for self-registration' });
        }

        if (!company_id) {
            return res.status(400).json({ message: 'company_id is required' });
        }

        // Verify company is active and get plan limits
        const [[company]] = await pool.query(
            `SELECT c.*, sp.name AS plan_name, sp.max_students, sp.max_teachers
             FROM companies c
             JOIN subscription_plans sp ON c.subscription_plan_id = sp.id
             WHERE c.id = ?`,
            [company_id]
        );
        if (!company || company.status !== 'active') {
            return res.status(400).json({ message: 'Company not found or not active' });
        }

        // Enforce plan limits
        if (role === 'student') {
            const [[{ cnt }]] = await pool.query(
                "SELECT COUNT(*) AS cnt FROM users WHERE company_id = ? AND role = 'student' AND is_active = TRUE",
                [company_id]
            );
            if (cnt >= company.max_students) {
                return res.status(400).json({
                    message: `Student limit reached (${company.max_students} max on ${company.plan_name} plan).`,
                });
            }
        } else if (role === 'teacher') {
            const [[{ cnt }]] = await pool.query(
                "SELECT COUNT(*) AS cnt FROM users WHERE company_id = ? AND role = 'teacher' AND is_active = TRUE",
                [company_id]
            );
            if (cnt >= company.max_teachers) {
                return res.status(400).json({
                    message: `Teacher limit reached (${company.max_teachers} max on ${company.plan_name} plan).`,
                });
            }
        }

        // Email uniqueness
        const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({ message: 'Email already registered' });
        }

        await pool.query(
            `INSERT INTO users (company_id, role, name, email, password, guardian_name, nationality, age)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [company_id, role, name, email, password,
             guardian_name || null, nationality || null, age || null]
        );

        const [[newUser]] = await pool.query(
            'SELECT id, company_id, role, name, email FROM users WHERE email = ?',
            [email]
        );

        // Notify company_admins and super_admins in parallel
        const [admins] = await pool.query(
            "SELECT id FROM users WHERE company_id = ? AND role = 'company_admin'",
            [company_id]
        );
        const notifType = role === 'student' ? 'new_student' : 'new_teacher';
        const notifTitle = role === 'student' ? 'New student registered' : 'New teacher registered';
        const [superAdmins] = await pool.query("SELECT id FROM users WHERE role = 'super_admin'");
        await Promise.all([
            ...admins.map(admin => notify({
                userId: admin.id,
                companyId: Number(company_id),
                type: notifType,
                title: notifTitle,
                message: `${name} has registered as a ${role} in your company.`,
            })),
            ...superAdmins.map(sa => notify({
                userId: sa.id,
                companyId: Number(company_id),
                type: notifType,
                title: notifTitle,
                message: `${name} joined "${company.name}" as a ${role}.`,
            })),
        ]);

        res.status(201).json({ message: 'User registered successfully', user: newUser });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
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

        // Block soft-deleted users
        if (user.is_active === false || user.is_active === 0) {
            return res.status(403).json({ message: 'This account has been deactivated. Please contact your administrator.' });
        }

        // For non-super_admin, verify company is active
        let trialExpired = false;
        if (user.role !== 'super_admin' && user.company_id) {
            const [[company]] = await pool.query(
                'SELECT status, trial_ends_at FROM companies WHERE id = ?',
                [user.company_id]
            );
            if (company && company.status === 'locked') {
                return res.status(403).json({
                    message: 'Your account is locked due to non-payment. Please contact support to restore access.',
                    account_locked: true,
                });
            }
            if (!company || company.status !== 'active') {
                return res.status(403).json({ message: 'Your company account is not active' });
            }
            // Trial expired: allow login but flag so frontend redirects to upgrade page
            if (company.trial_ends_at && new Date(company.trial_ends_at) < new Date()) {
                trialExpired = true;
            }
        }

        if (password !== user.password) {
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
                timezone: user.timezone || 'UTC',
                is_owner: user.is_owner ?? false,
            },
            trial_expired: trialExpired,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Forgot password — send reset email
router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email is required' });

        const [[user]] = await pool.query('SELECT id, name FROM users WHERE email = ?', [email]);
        // Always respond 200 to prevent email enumeration
        if (!user) return res.json({ message: 'If that email is registered, a reset link has been sent.' });

        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await pool.query(
            'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
            [token, expires, user.id]
        );

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

        await sendMail({
            to: email,
            subject: 'Password Reset — EuniTalk',
            html: `
                <p>Hi ${user.name},</p>
                <p>You requested a password reset. Click the link below to set a new password:</p>
                <p><a href="${resetUrl}" style="color:#65C3E8">${resetUrl}</a></p>
                <p>This link expires in <strong>1 hour</strong>. If you didn't request this, you can ignore this email.</p>
                <br/><p>— EuniTalk Team</p>
            `,
        });

        console.log(`[Password Reset] Reset email sent to ${email}`);
        res.json({ message: 'If that email is registered, a reset link has been sent.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Reset password — verify token and set new password
router.post('/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !password) return res.status(400).json({ message: 'Token and password are required' });
        if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });

        const [[user]] = await pool.query(
            'SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > NOW()',
            [token]
        );
        if (!user) return res.status(400).json({ message: 'Reset link is invalid or has expired.' });

        await pool.query(
            'UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
            [password, user.id]
        );

        res.json({ message: 'Password reset successfully. You can now log in.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
