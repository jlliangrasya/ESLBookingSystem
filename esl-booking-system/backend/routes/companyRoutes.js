const express = require('express');
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');
const { invalidateAuthCache } = authenticateToken;
const requireRole = require('../middleware/requireRole');
const notify = require('../utils/notify');
const { sendMail } = require('../utils/mailer');
const jwt = require('jsonwebtoken');
const { logAction } = require('../utils/audit');

const router = express.Router();

// Master switch for where the manual approval gate sits.
//
//   default (unset)              → new companies register as 'pending'. They can
//                                  log in immediately and do everything EXCEPT
//                                  invite real students. A super admin approves
//                                  them at that point, which flips them to
//                                  'active'. This is the intended flow: nothing
//                                  blocks a company until real student data is
//                                  about to leave the system.
//   AUTO_APPROVE_COMPANIES=true  → new companies land straight in 'active' and
//                                  can invite students with no review at all.
//
// NOTE: 'pending' no longer means "cannot use the product". It means "usable,
// but not yet cleared to invite students". Login and authMiddleware both let
// pending companies through — see resolveCompanyGate in authRoutes.js.
const AUTO_APPROVE_COMPANIES = process.env.AUTO_APPROVE_COMPANIES === 'true';

// PUBLIC: List subscription plans (for registration page)
router.get('/subscription-plans', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM subscription_plans WHERE is_active = TRUE ORDER BY price_monthly ASC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// PUBLIC: Register a new company (status: active, or 'pending' when AUTO_APPROVE_COMPANIES is off)
router.post('/register', async (req, res) => {
    const { company_name, company_email, company_phone, company_address, subscription_plan_id, owner_name, owner_email, owner_password, payment_reference } = req.body;

    if (!company_name || !company_email || !subscription_plan_id || !owner_name || !owner_email || !owner_password) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [[existingCompany]] = await connection.query('SELECT id FROM companies WHERE company_email = ?', [company_email]);
        if (existingCompany) {
            await connection.rollback();
            return res.status(400).json({ message: 'A company with this email is already registered' });
        }

        const [[sameName]] = await connection.query('SELECT id FROM companies WHERE LOWER(company_name) = LOWER(?)', [company_name]);
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
            `INSERT INTO companies (company_name, company_email, company_phone, company_address, subscription_plan_id, status)
             VALUES (?, ?, ?, ?, ?, 'pending')`,
            [company_name, company_email, company_phone || null, company_address || null, subscription_plan_id]
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

        // For paid plans, record the pending payment with the reference number in notes
        const isTrial = plan.price_monthly === 0;
        if (!isTrial) {
            const today = new Date().toISOString().split('T')[0];
            const periodEndDt = new Date();
            periodEndDt.setUTCMonth(periodEndDt.getUTCMonth() + 1);
            const periodEnd = periodEndDt.toISOString().split('T')[0];
            await connection.query(
                `INSERT INTO company_payments (company_id, amount, payment_date, period_start, period_end, notes, recorded_by)
                 VALUES (?, ?, ?, ?, ?, ?, NULL)`,
                [
                    companyId,
                    plan.price_monthly,
                    today,
                    today,
                    periodEnd,
                    payment_reference ? `Ref: ${payment_reference}` : 'Awaiting payment verification',
                ]
            );
        }

        // The billing clock starts at registration, never at approval — a company
        // that waits two days for student-invite approval must not lose two days
        // of trial. This runs for pending and active companies alike.
        await connection.query(
            isTrial
                ? `UPDATE companies SET trial_ends_at = DATE_ADD(NOW(), INTERVAL 30 DAY) WHERE id = ?`
                : `UPDATE companies SET next_due_date = DATE_ADD(NOW(), INTERVAL 1 MONTH) WHERE id = ?`,
            [companyId]
        );

        // Only skipping the gate entirely marks the company active here. Otherwise
        // it stays 'pending' — fully usable, but not cleared to invite students.
        if (AUTO_APPROVE_COMPANIES) {
            await connection.query(
                `UPDATE companies SET status = 'active', approved_at = NOW() WHERE id = ?`,
                [companyId]
            );
        }

        await connection.commit();

        // Notify all super_admins for visibility (fire-and-forget, after commit)
        const [superAdmins] = await pool.query('SELECT id FROM users WHERE role = ?', ['super_admin']);

        // Every registration now produces a usable account. The only thing that
        // varies is whether the company is already cleared to invite students.
        await Promise.all(superAdmins.map(sa => notify({
            userId: sa.id,
            companyId: null,
            type: 'new_company',
            title: 'New company registered',
            message: AUTO_APPROVE_COMPANIES
                ? `"${company_name}" registered on the ${plan.name} plan and was auto-activated.`
                : `"${company_name}" registered on the ${plan.name} plan. They can set up now; you'll be asked to review them before they invite students.`,
        })));

        // `notify` is intentionally fire-and-forget — do not await or .catch() it.
        notify({
            userId: ownerResult.insertId,
            companyId,
            type: 'company_approved',
            title: 'Your account is ready',
            message: 'Add your first teacher to see Brightfolks in action — it takes about a minute.',
            link: '/teachers?onboarding=1',
        });

        sendMail({
            to: owner_email,
            subject: 'Your Brightfolks account is ready',
            html: `<h2>Welcome, ${owner_name}!</h2>
                   <p><strong>${company_name}</strong> is registered and your account is ready to use right now — there's nothing to wait for.</p>
                   <p>Two quick steps to see Brightfolks working:</p>
                   <ol>
                     <li><strong>Add your first teacher</strong> — just a name and an email.</li>
                     <li><strong>Pick a class package</strong> — choose a ready-made one, customise it later.</li>
                   </ol>
                   <p>That's it. Your teacher gets an invite and can log in straight away.</p>
                   ${isTrial ? '<p>Your free trial runs for <strong>30 days</strong>, starting today.</p>' : ''}
                   ${AUTO_APPROVE_COMPANIES ? '' : `<p style="color:#555;font-size:14px">When you're ready to invite real students, we'll do a one-time review of your account first — that usually takes under 24 hours, and you can prepare everything while you wait.</p>`}`,
        }).catch(() => {});

        await logAction(companyId, ownerResult.insertId, 'onboarding_company_registered', 'company', companyId, {
            company_name,
            plan: plan.name,
            student_invites_gated: !AUTO_APPROVE_COMPANIES,
        });

        res.status(201).json({
            message: 'Registration successful! Your account is ready — you can log in immediately.',
            company_id: companyId,
            auto_activated: true,
            // Whether this company still needs review before inviting real students.
            student_invites_gated: !AUTO_APPROVE_COMPANIES,
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
                c.id, c.company_name, c.company_email, c.company_phone, c.company_address, c.status,
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

        // Approval clears the company to invite real students. It must NOT restart
        // the billing clock — that started at registration, and resetting it here
        // would hand out a free extension equal to however long review took.
        // COALESCE only backfills companies that predate that change.
        await pool.query(
            isTrial
                ? `UPDATE companies SET status = 'active', approved_by = ?, approved_at = NOW(),
                   trial_ends_at = COALESCE(trial_ends_at, DATE_ADD(NOW(), INTERVAL 30 DAY)) WHERE id = ?`
                : `UPDATE companies SET status = 'active', approved_by = ?, approved_at = NOW(),
                   next_due_date = COALESCE(next_due_date, DATE_ADD(NOW(), INTERVAL 1 MONTH)) WHERE id = ?`,
            [superAdminId, id]
        );

        // The owner is very likely sitting on the waiting screen right now. Without
        // this they'd keep seeing "pending" for up to the 60s auth cache TTL.
        invalidateAuthCache(null, Number(id));

        // Notify the owner in-app AND by email, both pointing back at the exact
        // step they were blocked on rather than at the login page.
        // Prefer the owner, but fall back to any company_admin. This is the one
        // notification the company is actively waiting on, so it must not go
        // nowhere just because is_owner was never set on a legacy row.
        const [[admin]] = await pool.query(
            `SELECT id, name, email FROM users WHERE company_id = ? AND role = 'company_admin'
             ORDER BY is_owner DESC, id ASC LIMIT 1`,
            [id]
        );
        const inviteLink = '/students?invite=1';
        if (admin) {
            notify({
                userId: admin.id,
                companyId: Number(id),
                type: 'company_approved',
                title: "You're approved — invite your students",
                message: 'Your account has been reviewed. You can now invite real students. Any drafts you prepared are ready to submit.',
                link: inviteLink,
            });

            const frontend = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
            sendMail({
                to: admin.email,
                subject: "You're approved — invite your students",
                html: `<h2>You're approved, ${admin.name}!</h2>
                       <p>We've finished reviewing <strong>${company.company_name}</strong>. You can now invite real students.</p>
                       <p>If you prepared a roster while you were waiting, it's saved and ready to submit.</p>
                       <p><a href="${frontend}${inviteLink}" style="display:inline-block;padding:10px 18px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none">Pick up where you left off</a></p>
                       <p style="color:#777;font-size:13px">This link takes you straight to the student invite step.</p>`,
            }).catch(() => {});
        }

        await logAction(Number(id), superAdminId, 'onboarding_approved', 'company', Number(id), { company_name: company.company_name, plan: company.plan_name });
        res.json({ message: `Company "${company.company_name}" approved successfully` });
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

        await logAction(null, req.user.id, 'company_rejected', 'company', Number(id), { company_name: company.company_name });
        res.json({ message: `Company "${company.company_name}" rejected` });
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
        const [[company]] = await pool.query('SELECT company_name FROM companies WHERE id = ?', [id]);
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
        await logAction(null, req.user.id, 'company_locked', 'company', Number(id), { company_name: company.company_name });
        res.json({ message: 'Company locked' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// SUPER ADMIN: Unlock a company
router.post('/:id/unlock', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query("UPDATE companies SET status = 'active', trial_ends_at = NULL WHERE id = ?", [id]);

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

// SUPER ADMIN: Mark subscription as paid — records payment history + extends next_due_date by 1 month
router.post('/:id/mark-paid', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const superAdminId = req.user.id;
        const { notes } = req.body;

        const [[company]] = await pool.query(`
            SELECT c.company_name, c.next_due_date, sp.price_monthly
            FROM companies c
            JOIN subscription_plans sp ON c.subscription_plan_id = sp.id
            WHERE c.id = ?
        `, [id]);
        if (!company) return res.status(404).json({ message: 'Company not found' });

        // Payment period: from current next_due_date (or today) + 1 month
        const periodStart = company.next_due_date
            ? String(company.next_due_date).slice(0, 10)
            : new Date().toISOString().split('T')[0];
        const periodEndDt = new Date(periodStart + 'T00:00:00Z');
        periodEndDt.setUTCMonth(periodEndDt.getUTCMonth() + 1);
        const periodEnd = periodEndDt.toISOString().split('T')[0];

        // Record in payment history
        await pool.query(
            `INSERT INTO company_payments (company_id, amount, payment_date, period_start, period_end, notes, recorded_by)
             VALUES (?, ?, CURDATE(), ?, ?, ?, ?)`,
            [id, company.price_monthly, periodStart, periodEnd, notes || null, superAdminId]
        );

        // Update company billing dates
        await pool.query(
            `UPDATE companies SET last_paid_at = NOW(),
             next_due_date = DATE_ADD(COALESCE(next_due_date, CURDATE()), INTERVAL 1 MONTH),
             trial_ends_at = NULL,
             status = IF(status IN ('locked', 'suspended'), 'active', status)
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
                message: `Your subscription payment of ₱${Number(company.price_monthly).toLocaleString()} has been confirmed. Your account is active for another month.`,
            });
        }
        res.json({ message: 'Payment recorded, subscription extended by 1 month' });
    } catch (err) {
        console.error(err);
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
        const [[company]] = await pool.query('SELECT company_name FROM companies WHERE id = ?', [companyId]);
        const [[plan]] = await pool.query('SELECT name FROM subscription_plans WHERE id = ?', [subscription_plan_id]);
        await Promise.all(superAdmins.map(sa => notify({
            userId: sa.id,
            companyId: null,
            type: 'upgrade_request',
            title: 'Plan upgrade request',
            message: `"${company?.company_name}" has requested an upgrade to the ${plan?.name} plan.`,
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
