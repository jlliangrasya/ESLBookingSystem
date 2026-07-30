const express = require('express');
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const notify = require('../utils/notify');
const { sendMail } = require('../utils/mailer');
const { logAction } = require('../utils/audit');

const router = express.Router();

// The four steps a new company walks through. Kept here, server-side, so the
// progress indicator and the funnel report can never disagree about what
// "3 of 4 done" means.
const STEP_KEYS = ['company_registered', 'teacher_added', 'class_created', 'milestone_reached'];

/**
 * GET /api/onboarding/status
 *
 * Single source of truth for the progress indicator, the milestone screen and the
 * post-milestone prompts. Derived entirely from existing rows — nothing here is a
 * stored copy of progress that could drift out of sync with reality.
 */
router.get('/status', authenticateToken, requireRole('company_admin'), async (req, res) => {
    try {
        const companyId = req.user.company_id;

        const [[company]] = await pool.query(
            'SELECT status, company_name, created_at, approved_at FROM companies WHERE id = ?',
            [companyId]
        );
        if (!company) return res.status(404).json({ message: 'Company not found' });

        const [[studentPackageCounts]] = await pool.query(
            `SELECT
               (SELECT COUNT(*) FROM users WHERE company_id = ? AND role = 'student' AND is_active = TRUE) AS student_count,
               (SELECT COUNT(*) FROM tutorial_packages WHERE company_id = ? AND is_active = TRUE) AS package_count`,
            [companyId, companyId]
        );

        // One query for all three teacher facts — the count, who to chase about an
        // unopened invite, and whether the milestone has been hit. A new company has
        // a handful of teachers at most, so filtering in JS is cheaper than three
        // round trips with three different ORDER BY / WHERE combinations.
        const [teachers] = await pool.query(
            `SELECT id, name, email, is_active, last_login_at FROM users
             WHERE company_id = ? AND role = 'teacher'
             ORDER BY id ASC`,
            [companyId]
        );

        const activeTeachers = teachers.filter((t) => !!t.is_active);

        // Named so the owner can be told WHO to chase when the invite is unopened.
        const firstTeacher = activeTeachers[0] || null;

        // The milestone is "a teacher can log in and see their assigned class", and
        // the observable half of that is the login. Earliest login wins, so the
        // milestone doesn't move when more teachers are added later. Deactivated
        // teachers still count — the milestone genuinely happened, and letting a
        // later deactivation un-complete a finished step would be wrong.
        const milestoneTeacher =
            teachers
                .filter((t) => t.last_login_at)
                .sort((a, b) => new Date(a.last_login_at) - new Date(b.last_login_at))[0] || null;

        const counts = {
            teacher_count: activeTeachers.length,
            student_count: studentPackageCounts.student_count,
            package_count: studentPackageCounts.package_count,
        };

        const steps = {
            company_registered: true,
            teacher_added: counts.teacher_count > 0,
            class_created: counts.package_count > 0,
            milestone_reached: !!milestoneTeacher,
        };
        const completedCount = STEP_KEYS.filter((k) => steps[k]).length;

        res.json({
            company_name: company.company_name,
            company_status: company.status,
            // Whether this company still needs review before inviting real students.
            student_invites_gated: company.status === 'pending',
            steps,
            step_keys: STEP_KEYS,
            completed_count: completedCount,
            total_count: STEP_KEYS.length,
            counts,
            first_teacher: firstTeacher
                ? { id: firstTeacher.id, name: firstTeacher.name, email: firstTeacher.email }
                : null,
            milestone_teacher: milestoneTeacher
                ? { id: milestoneTeacher.id, name: milestoneTeacher.name, last_login_at: milestoneTeacher.last_login_at }
                : null,
            // True once the whole required path is done — the point at which the UI
            // stops pushing and starts offering the optional extras.
            onboarding_complete: completedCount === STEP_KEYS.length,
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * POST /api/onboarding/request-approval
 *
 * Called when a pending company hits the student-invite gate. Pings the super
 * admins so review can start; safe to call repeatedly (a company that reloads the
 * waiting screen shouldn't spam anyone).
 */
router.post('/request-approval', authenticateToken, requireRole('company_admin'), async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const [[company]] = await pool.query(
            'SELECT status, company_name FROM companies WHERE id = ?',
            [companyId]
        );
        if (!company) return res.status(404).json({ message: 'Company not found' });
        if (company.status !== 'pending') {
            return res.json({ message: 'Already approved', already_approved: true });
        }

        // Don't re-notify if this company already asked in the last 24h.
        const [[recent]] = await pool.query(
            `SELECT id FROM audit_logs
             WHERE company_id = ? AND action = 'onboarding_approval_requested'
               AND created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)
             LIMIT 1`,
            [companyId]
        );
        if (recent) {
            return res.json({ message: 'Review already requested', already_requested: true });
        }

        const [superAdmins] = await pool.query("SELECT id, email FROM users WHERE role = 'super_admin'");
        await Promise.all(superAdmins.map((sa) => notify({
            userId: sa.id,
            companyId: null,
            type: 'approval_request',
            title: 'Company ready to invite students',
            message: `"${company.company_name}" has finished setup and wants to invite real students. Review them to unblock.`,
            link: '/super-admin',
        })));

        const firstSuperAdmin = superAdmins.find((sa) => sa.email);
        if (firstSuperAdmin) {
            sendMail({
                to: firstSuperAdmin.email,
                subject: `Review needed: ${company.company_name} wants to invite students`,
                html: `<p><strong>${company.company_name}</strong> has completed onboarding and is waiting on approval to invite real students.</p>
                       <p>Approve them from the super admin dashboard to unblock.</p>`,
            }).catch(() => {});
        }

        await logAction(companyId, req.user.id, 'onboarding_approval_requested', 'company', companyId, {
            company_name: company.company_name,
        });

        res.status(201).json({ message: 'Review requested' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// ── Drafts ─────────────────────────────────────────────────────────────────
// Lets a company waiting on approval prepare its roster and schedule so the data
// is ready to submit the instant they're cleared. Drafts are deliberately NOT
// users: nothing here creates an account or sends anyone an email, which is
// exactly why it's allowed to happen before review.

const DRAFT_KINDS = ['teacher', 'student', 'schedule'];

router.get('/drafts', authenticateToken, requireRole('company_admin'), async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, kind, payload, created_at, updated_at FROM onboarding_drafts WHERE company_id = ? ORDER BY id ASC',
            [req.user.company_id]
        );
        res.json(rows.map((r) => ({
            id: r.id,
            kind: r.kind,
            // Tolerate a malformed blob rather than 500-ing the whole waiting screen.
            payload: safeParse(r.payload),
            created_at: r.created_at,
            updated_at: r.updated_at,
        })));
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/drafts', authenticateToken, requireRole('company_admin'), async (req, res) => {
    try {
        const { kind, payload } = req.body;
        if (!DRAFT_KINDS.includes(kind)) {
            return res.status(400).json({ message: `kind must be one of: ${DRAFT_KINDS.join(', ')}` });
        }
        if (!payload || typeof payload !== 'object') {
            return res.status(400).json({ message: 'payload object is required' });
        }

        // Cap per company so a draft list can't be used as unbounded storage.
        const [[{ cnt }]] = await pool.query(
            'SELECT COUNT(*) AS cnt FROM onboarding_drafts WHERE company_id = ? AND kind = ?',
            [req.user.company_id, kind]
        );
        if (cnt >= 200) {
            return res.status(400).json({ message: 'Draft limit reached for this type' });
        }

        const [result] = await pool.query(
            'INSERT INTO onboarding_drafts (company_id, kind, payload, created_by) VALUES (?, ?, ?, ?)',
            [req.user.company_id, kind, JSON.stringify(payload), req.user.id]
        );
        res.status(201).json({ id: result.insertId, kind, payload });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.put('/drafts/:id', authenticateToken, requireRole('company_admin'), async (req, res) => {
    try {
        const { payload } = req.body;
        if (!payload || typeof payload !== 'object') {
            return res.status(400).json({ message: 'payload object is required' });
        }
        // company_id in the WHERE clause is what stops one company editing another's drafts.
        const [result] = await pool.query(
            'UPDATE onboarding_drafts SET payload = ? WHERE id = ? AND company_id = ?',
            [JSON.stringify(payload), req.params.id, req.user.company_id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Draft not found' });
        res.json({ message: 'Draft saved' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.delete('/drafts/:id', authenticateToken, requireRole('company_admin'), async (req, res) => {
    try {
        const [result] = await pool.query(
            'DELETE FROM onboarding_drafts WHERE id = ? AND company_id = ?',
            [req.params.id, req.user.company_id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Draft not found' });
        res.json({ message: 'Draft deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * GET /api/onboarding/funnel  (super admin)
 *
 * Step-by-step conversion across all companies, read out of audit_logs. Uses the
 * existing audit table rather than a new analytics store — every onboarding event
 * is already written there via logAction.
 */
router.get('/funnel', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);

        const FUNNEL_ACTIONS = [
            'onboarding_company_registered',
            'onboarding_teacher_added',
            'onboarding_class_created',
            'onboarding_milestone_reached',
            'onboarding_approval_requested',
            'onboarding_approved',
            'onboarding_student_invited',
        ];

        // COUNT(DISTINCT company_id) — one company that adds five teachers is still
        // one company through the step. Counting raw rows would inflate every stage.
        const [rows] = await pool.query(
            `SELECT action, COUNT(DISTINCT company_id) AS companies
             FROM audit_logs
             WHERE action IN (${FUNNEL_ACTIONS.map(() => '?').join(',')})
               AND created_at > DATE_SUB(NOW(), INTERVAL ? DAY)
             GROUP BY action`,
            [...FUNNEL_ACTIONS, days]
        );

        const byAction = Object.fromEntries(rows.map((r) => [r.action, Number(r.companies)]));
        const registered = byAction.onboarding_company_registered || 0;

        res.json({
            window_days: days,
            stages: FUNNEL_ACTIONS.map((action) => {
                const companies = byAction[action] || 0;
                return {
                    action,
                    label: action.replace('onboarding_', '').replace(/_/g, ' '),
                    companies,
                    // Share of companies that registered in the window and got this far.
                    pct_of_registered: registered ? Math.round((companies / registered) * 1000) / 10 : null,
                };
            }),
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

function safeParse(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

module.exports = router;
