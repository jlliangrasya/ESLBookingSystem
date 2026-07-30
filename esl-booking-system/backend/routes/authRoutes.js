const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const notify = require('../utils/notify');
const { sendMail } = require('../utils/mailer');
const { logAction } = require('../utils/audit');
const authenticateToken = require('../middleware/authMiddleware');
require('dotenv').config();

const router = express.Router();

// Roles allowed to link a second account (the "admin who also teaches" case).
const LINKABLE_ROLES = ['company_admin', 'teacher'];

/**
 * Resolve a user's company gating state. Throws an error carrying `.status`
 * when the company blocks sign-in outright.
 * Shared by /login and /switch-account so the two can't drift apart.
 */
async function resolveCompanyState(user) {
    let trialExpired = false;
    let companyStatus = 'active';
    let companyName = null;

    if (user.role !== 'super_admin' && user.company_id) {
        const [[company]] = await pool.query(
            'SELECT status, trial_ends_at, company_name FROM companies WHERE id = ?',
            [user.company_id]
        );
        if (company) companyName = company.company_name || null;
        if (company && company.status === 'locked') {
            // Allow login but flag — frontend redirects to locked page
            companyStatus = 'locked';
        } else if (company && company.status === 'suspended') {
            // Allow login but flag — frontend redirects to suspended page
            companyStatus = 'suspended';
        } else if (company && company.status === 'pending') {
            // 'pending' means "registered and fully usable, but not yet cleared to
            // invite real students" — it is NOT a sign-in block. The only thing it
            // gates is POST /api/admin/students. Sign in normally and let the
            // frontend surface the gate at the invite step.
            companyStatus = 'pending';
            if (company.trial_ends_at && new Date(company.trial_ends_at) < new Date()) {
                trialExpired = true;
            }
        } else if (!company || company.status !== 'active') {
            // Still a hard stop for 'rejected' and for a missing company row.
            const err = new Error('Your company account is not active');
            err.status = 403;
            throw err;
        } else if (company.trial_ends_at && new Date(company.trial_ends_at) < new Date()) {
            trialExpired = true;
        }
    }

    return { trialExpired, companyStatus, companyName };
}

/** Sign a JWT and build the session payload the frontend stores in AuthContext. */
function buildSession(user, { trialExpired, companyStatus, companyName }) {
    const token = jwt.sign(
        { id: user.id, role: user.role, company_id: user.company_id },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
    );

    return {
        token,
        user: {
            id: user.id,
            name: user.name,
            role: user.role,
            company_id: user.company_id,
            company_name: companyName,
            timezone: user.timezone || 'UTC',
            is_owner: user.is_owner ?? false,
        },
        trial_expired: trialExpired,
        company_status: companyStatus,
    };
}

// Rate limiters for sensitive auth endpoints (login is intentionally unlimited)
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20,
    message: { message: 'Too many registration attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Linking verifies another account's password, so it is a brute-force target.
// Keyed by the caller's user id (runs after authenticateToken), not by IP.
const linkAccountLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    message: { message: 'Too many link attempts. Please try again in an hour.' },
    keyGenerator: (req) => String(req.user.id), // always set — runs after authenticateToken
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
                message: `${name} joined "${company.company_name}" as a ${role}.`,
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
        const companyState = await resolveCompanyState(user);

        if (password !== user.password) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        // First teacher login is what completes the onboarding milestone, so the
        // timestamp has to be recorded before we can report the milestone as done.
        // Deliberately not awaited and errors swallowed — this must never be able
        // to fail a login.
        const isFirstLogin = !user.last_login_at;
        pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]).catch(() => {});
        if (isFirstLogin && user.role === 'teacher' && user.company_id) {
            recordMilestoneOnce(user).catch(() => {});
        }

        res.json(buildSession(user, companyState));
    } catch (err) {
        if (err.status) return res.status(err.status).json({ message: err.message });
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * Record the onboarding milestone — "the teacher you invited has logged in" — and
 * tell the company owner, who is the one who needs to see it.
 *
 * Fires at most once per company. Two things make that guard necessary:
 *
 *   1. The migration adds users.last_login_at as NULL for EVERY existing user, so
 *      without this check the next login of every long-since-onboarded teacher
 *      would look like a first login and congratulate their owner on a milestone
 *      they passed months ago.
 *   2. Two concurrent first logins would otherwise both see last_login_at as NULL
 *      and both fire.
 *
 * Companies that already have students are past onboarding by definition, so they
 * are excluded too — that covers existing companies whose teachers happen never to
 * have logged in before.
 */
async function recordMilestoneOnce(teacher) {
    const [[alreadyRecorded]] = await pool.query(
        "SELECT id FROM audit_logs WHERE company_id = ? AND action = 'onboarding_milestone_reached' LIMIT 1",
        [teacher.company_id]
    );
    if (alreadyRecorded) return;

    const [[{ studentCount }]] = await pool.query(
        "SELECT COUNT(*) AS studentCount FROM users WHERE company_id = ? AND role = 'student'",
        [teacher.company_id]
    );
    if (studentCount > 0) return;

    await logAction(teacher.company_id, teacher.id, 'onboarding_milestone_reached', 'user', teacher.id, {
        teacher_name: teacher.name,
    });

    const [[owner]] = await pool.query(
        `SELECT id FROM users WHERE company_id = ? AND role = 'company_admin'
         ORDER BY is_owner DESC, id ASC LIMIT 1`,
        [teacher.company_id]
    );
    if (!owner) return;
    notify({
        userId: owner.id,
        companyId: teacher.company_id,
        type: 'onboarding_milestone',
        title: `${teacher.name} just logged in 🎉`,
        message: `Nice — ${teacher.name} can now see their class. Want to add the rest of your team?`,
        link: '/onboarding/milestone',
    });
}

// ── Linked accounts ────────────────────────────────────────────────────────
// Lets one person who owns two accounts (e.g. a company_admin who also teaches)
// switch between them from the profile menu instead of logging out and back in.
// Ownership is proven once, by password, when the link is created.

// List the accounts linked to the caller
router.get('/linked-accounts', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT u.id, u.name, u.email, u.role
             FROM account_links al
             JOIN users u ON u.id = IF(al.user_id_a = ?, al.user_id_b, al.user_id_a)
             WHERE (al.user_id_a = ? OR al.user_id_b = ?) AND u.is_active = TRUE
             ORDER BY u.name`,
            [req.user.id, req.user.id, req.user.id]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Link another account the caller owns — requires that account's password
router.post('/link-account', authenticateToken, linkAccountLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const [[me]] = await pool.query(
            'SELECT id, role, company_id FROM users WHERE id = ?',
            [req.user.id]
        );
        if (!me || !LINKABLE_ROLES.includes(me.role)) {
            return res.status(403).json({ message: 'This account type cannot link another account' });
        }

        const [[target]] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);

        // Same generic message for every ownership failure — never reveal
        // whether the email exists or which specific check failed.
        const invalid = () => res.status(400).json({ message: 'Invalid email or password' });

        if (!target || password !== target.password) return invalid();
        if (target.id === me.id) {
            return res.status(400).json({ message: 'That is the account you are already signed in to' });
        }
        if (!target.is_active) return invalid();
        if (!LINKABLE_ROLES.includes(target.role)) return invalid();
        // Both accounts must belong to the same company — never link across tenants
        if (!me.company_id || target.company_id !== me.company_id) return invalid();

        const [a, b] = me.id < target.id ? [me.id, target.id] : [target.id, me.id];

        const [[existing]] = await pool.query(
            'SELECT id FROM account_links WHERE user_id_a = ? AND user_id_b = ?',
            [a, b]
        );
        if (existing) {
            return res.status(400).json({ message: 'These accounts are already linked' });
        }

        await pool.query(
            'INSERT INTO account_links (company_id, user_id_a, user_id_b, created_by) VALUES (?, ?, ?, ?)',
            [me.company_id, a, b, me.id]
        );

        await logAction(me.company_id, me.id, 'account_link_created', 'user', target.id, {
            linked_email: target.email,
            linked_role: target.role,
        });

        res.status(201).json({
            message: 'Account linked successfully',
            account: { id: target.id, name: target.name, email: target.email, role: target.role },
        });
    } catch (err) {
        // Two concurrent link requests for the same pair — the unique key wins
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'These accounts are already linked' });
        }
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Remove a link (either side can remove it)
router.delete('/linked-accounts/:userId', authenticateToken, async (req, res) => {
    try {
        const targetId = Number(req.params.userId);
        if (!targetId) return res.status(400).json({ message: 'Invalid account id' });

        const [a, b] = req.user.id < targetId ? [req.user.id, targetId] : [targetId, req.user.id];
        const [result] = await pool.query(
            'DELETE FROM account_links WHERE user_id_a = ? AND user_id_b = ?',
            [a, b]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Link not found' });
        }

        await logAction(req.user.company_id, req.user.id, 'account_link_removed', 'user', targetId, null);

        res.json({ message: 'Account unlinked' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Switch to a linked account — issues a fresh token for it, no password needed
// (ownership was already proven when the link was created)
router.post('/switch-account', authenticateToken, async (req, res) => {
    try {
        const targetId = Number(req.body.user_id);
        if (!targetId) return res.status(400).json({ message: 'Invalid account id' });

        // The link must connect the *authenticated* caller to the target —
        // this is the only thing standing between a token and another account.
        const [a, b] = req.user.id < targetId ? [req.user.id, targetId] : [targetId, req.user.id];
        const [[link]] = await pool.query(
            'SELECT id FROM account_links WHERE user_id_a = ? AND user_id_b = ?',
            [a, b]
        );
        if (!link) {
            return res.status(403).json({ message: 'That account is not linked to yours' });
        }

        const [[target]] = await pool.query('SELECT * FROM users WHERE id = ?', [targetId]);
        if (!target) return res.status(404).json({ message: 'Account no longer exists' });
        if (!target.is_active) {
            return res.status(403).json({ message: 'That account has been deactivated.' });
        }

        const companyState = await resolveCompanyState(target);

        await logAction(target.company_id, req.user.id, 'account_switched', 'user', target.id, {
            from_role: req.user.role,
            to_role: target.role,
        });

        res.json(buildSession(target, companyState));
    } catch (err) {
        if (err.status) return res.status(err.status).json({ message: err.message });
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

        const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();
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
