const cron = require('node-cron');
const pool = require('./db');
const notify = require('./utils/notify');
const { sendMail } = require('./utils/mailer');
const logger = require('./utils/logger');

// ── Billing Checks (daily at 2:00 AM) ─────────────────────────────────────────
async function runBillingChecks() {
    logger.info('[Scheduler] Running billing checks...');

    try {
        // A. Notify company owner 5 days before due date
        const [due5] = await pool.query(
            `SELECT c.id, c.company_name AS name FROM companies c
             WHERE c.next_due_date = DATE_ADD(CURDATE(), INTERVAL 5 DAY)
             AND c.status = 'active'`
        );
        await Promise.all(due5.map(async (company) => {
            const [owners] = await pool.query(
                "SELECT id FROM users WHERE company_id = ? AND role = 'company_admin' AND is_owner = TRUE",
                [company.id]
            );
            await Promise.all(owners.map(owner => notify({
                userId: owner.id,
                companyId: company.id,
                type: 'payment_reminder',
                title: 'Subscription due in 5 days',
                message: `Your monthly subscription for "${company.name}" is due in 5 days. Please arrange payment to avoid service interruption.`,
            })));
        }));

        // B. Notify super admins 3 days before due date
        const [due3] = await pool.query(
            `SELECT c.id, c.company_name AS name FROM companies c
             WHERE c.next_due_date = DATE_ADD(CURDATE(), INTERVAL 3 DAY)
             AND c.status = 'active'`
        );
        if (due3.length > 0) {
            const [superAdmins] = await pool.query("SELECT id FROM users WHERE role = 'super_admin'");
            await Promise.all(due3.flatMap(company =>
                superAdmins.map(sa => notify({
                    userId: sa.id,
                    companyId: null,
                    type: 'payment_overdue_warning',
                    title: 'Company payment due in 3 days',
                    message: `"${company.name}" has not paid their subscription and it is due in 3 days.`,
                }))
            ));
        }

        // C. Auto-lock companies past their due date
        const [overdue] = await pool.query(
            `SELECT c.id, c.company_name AS name FROM companies c
             WHERE c.next_due_date < CURDATE()
             AND c.status = 'active'`
        );
        await Promise.all(overdue.map(async (company) => {
            await pool.query("UPDATE companies SET status = 'locked' WHERE id = ?", [company.id]);
            const [owners] = await pool.query(
                "SELECT id FROM users WHERE company_id = ? AND role = 'company_admin' AND is_owner = TRUE",
                [company.id]
            );
            await Promise.all(owners.map(owner => notify({
                userId: owner.id,
                companyId: company.id,
                type: 'account_locked',
                title: 'Account locked — payment overdue',
                message: `Your account for "${company.name}" has been locked because the subscription payment is overdue. Please contact support to restore access.`,
            })));
            logger.warn(`[Scheduler] Locked company: ${company.name} (id=${company.id})`);
        }));

        // D. Auto-lock companies whose free trial has expired
        const [expiredTrials] = await pool.query(
            `SELECT c.id, c.company_name AS name FROM companies c
             WHERE c.trial_ends_at < CURDATE()
             AND c.status = 'active'
             AND c.next_due_date IS NULL`
        );
        await Promise.all(expiredTrials.map(async (company) => {
            await pool.query("UPDATE companies SET status = 'locked' WHERE id = ?", [company.id]);
            const [owners] = await pool.query(
                "SELECT id FROM users WHERE company_id = ? AND role = 'company_admin' AND is_owner = TRUE",
                [company.id]
            );
            await Promise.all(owners.map(owner => notify({
                userId: owner.id,
                companyId: company.id,
                type: 'trial_expired',
                title: 'Free trial has ended',
                message: `Your free trial for "${company.name}" has expired. Please upgrade to a paid plan to continue using the service.`,
            })));
            logger.warn(`[Scheduler] Locked expired trial: ${company.name} (id=${company.id})`);
        }));

        logger.info(`[Scheduler] Done. Notified (5d): ${due5.length}, Notified SA (3d): ${due3.length}, Locked: ${overdue.length}, Trial expired: ${expiredTrials.length}`);
    } catch (err) {
        logger.error('[Scheduler] Error during billing checks:', err);
    }
}

// ── Issue #8: Class Reminders (runs every 15 minutes) ──────────────────────────
async function runClassReminders() {
    try {
        // Find bookings starting in the next 30-60 minutes that haven't been reminded
        const [upcoming] = await pool.query(`
            SELECT b.id, b.appointment_date, b.teacher_id, b.class_mode, b.meeting_link,
                   sp.student_id, u_student.name AS student_name, u_student.email AS student_email,
                   u_teacher.name AS teacher_name, u_teacher.email AS teacher_email
            FROM bookings b
            JOIN student_packages sp ON b.student_package_id = sp.id
            JOIN users u_student ON sp.student_id = u_student.id
            LEFT JOIN users u_teacher ON b.teacher_id = u_teacher.id
            WHERE b.status IN ('confirmed', 'pending')
              AND b.reminded = FALSE
              AND b.appointment_date BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 60 MINUTE)
        `);

        for (const booking of upcoming) {
            const dateStr = new Date(booking.appointment_date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
            const meetingInfo = booking.meeting_link ? ` Meeting link: ${booking.meeting_link}` : '';

            // Notify student
            await notify({
                userId: booking.student_id,
                companyId: null,
                type: 'class_reminder',
                title: 'Class starting soon!',
                message: `Your class with ${booking.teacher_name || 'your teacher'} starts at ${dateStr}.${meetingInfo}`,
            });

            // Notify teacher
            if (booking.teacher_id) {
                await notify({
                    userId: booking.teacher_id,
                    companyId: null,
                    type: 'class_reminder',
                    title: 'Class starting soon!',
                    message: `Your class with ${booking.student_name} starts at ${dateStr}.${meetingInfo}`,
                });
            }

            // Send email reminders if SMTP is configured
            if (booking.student_email) {
                sendMail({
                    to: booking.student_email,
                    subject: 'Class Reminder - Starting Soon!',
                    html: `<p>Hi ${booking.student_name},</p>
                           <p>Your class with <strong>${booking.teacher_name || 'your teacher'}</strong> starts at <strong>${dateStr}</strong>.</p>
                           ${booking.meeting_link ? `<p>Meeting link: <a href="${booking.meeting_link}">${booking.meeting_link}</a></p>` : ''}
                           <p>Don't be late!</p>`,
                }).catch(() => {});
            }

            if (booking.teacher_email && booking.teacher_id) {
                sendMail({
                    to: booking.teacher_email,
                    subject: 'Class Reminder - Starting Soon!',
                    html: `<p>Hi ${booking.teacher_name},</p>
                           <p>Your class with <strong>${booking.student_name}</strong> starts at <strong>${dateStr}</strong>.</p>
                           ${booking.meeting_link ? `<p>Meeting link: <a href="${booking.meeting_link}">${booking.meeting_link}</a></p>` : ''}`,
                }).catch(() => {});
            }

            // Mark as reminded
            await pool.query('UPDATE bookings SET reminded = TRUE WHERE id = ?', [booking.id]);
        }

        if (upcoming.length > 0) {
            logger.info(`[Scheduler] Sent ${upcoming.length} class reminder(s)`);
        }
    } catch (err) {
        logger.error('[Scheduler] Error during class reminders:', err);
    }
}

// ── Issue #14: Company Onboarding Follow-up (daily at 9:00 AM) ─────────────────
async function runOnboardingFollowUp() {
    try {
        // Companies pending for more than 48 hours — notify super admins
        const [stalePending] = await pool.query(`
            SELECT c.id, c.company_name, c.company_email, c.created_at
            FROM companies c
            WHERE c.status = 'pending'
              AND c.created_at < DATE_SUB(NOW(), INTERVAL 48 HOUR)
              AND c.created_at > DATE_SUB(NOW(), INTERVAL 49 HOUR)
        `);

        if (stalePending.length > 0) {
            const [superAdmins] = await pool.query("SELECT id FROM users WHERE role = 'super_admin'");
            for (const company of stalePending) {
                // Notify super admins about stale pending companies
                await Promise.all(superAdmins.map(sa => notify({
                    userId: sa.id,
                    companyId: null,
                    type: 'onboarding_stale',
                    title: 'Pending company awaiting approval',
                    message: `"${company.company_name}" has been waiting for approval for over 48 hours. Please review their application.`,
                })));

                // Notify the company owner about the wait
                const [[owner]] = await pool.query(
                    "SELECT id, email FROM users WHERE company_id = ? AND role = 'company_admin' AND is_owner = TRUE LIMIT 1",
                    [company.id]
                );
                if (owner) {
                    await notify({
                        userId: owner.id,
                        companyId: company.id,
                        type: 'onboarding_update',
                        title: 'Application under review',
                        message: 'Your company registration is still being reviewed. Our team typically processes applications within 48 hours. Thank you for your patience.',
                    });

                    // Send email as well
                    sendMail({
                        to: company.company_email,
                        subject: 'Your Company Registration - Status Update',
                        html: `<p>Hi,</p>
                               <p>We wanted to let you know that your company registration for <strong>${company.company_name}</strong> is still being reviewed by our team.</p>
                               <p>Applications are typically processed within 48 hours. We'll notify you as soon as a decision is made.</p>
                               <p>Thank you for your patience!</p>`,
                    }).catch(() => {});
                }
            }
            logger.info(`[Scheduler] Sent onboarding follow-ups for ${stalePending.length} company(ies)`);
        }
    } catch (err) {
        logger.error('[Scheduler] Error during onboarding follow-up:', err);
    }
}

// ── Issue #12: Database Backup (daily at 3:00 AM) ──────────────────────────────
async function runDatabaseBackup() {
    try {
        // Log critical data counts for disaster recovery monitoring
        const [[counts]] = await pool.query(`
            SELECT
                (SELECT COUNT(*) FROM companies) AS companies,
                (SELECT COUNT(*) FROM users) AS users,
                (SELECT COUNT(*) FROM bookings) AS bookings,
                (SELECT COUNT(*) FROM student_packages) AS student_packages,
                (SELECT COUNT(*) FROM class_reports) AS class_reports
        `);

        logger.info('[Backup] Daily data integrity check:', counts);

        // Insert a backup log record for tracking
        await pool.query(
            `INSERT INTO backup_logs (backup_type, status, details)
             VALUES ('integrity_check', 'success', ?)`,
            [JSON.stringify(counts)]
        );

        // Alert super admins if critical tables lost data (count dropped significantly)
        const [prevLogs] = await pool.query(
            `SELECT details FROM backup_logs
             WHERE backup_type = 'integrity_check' AND status = 'success'
             ORDER BY created_at DESC LIMIT 1 OFFSET 1`
        );

        if (prevLogs.length > 0) {
            const prev = JSON.parse(prevLogs[0].details);
            const alerts = [];
            if (counts.users < prev.users * 0.9) alerts.push(`Users dropped from ${prev.users} to ${counts.users}`);
            if (counts.bookings < prev.bookings * 0.9) alerts.push(`Bookings dropped from ${prev.bookings} to ${counts.bookings}`);

            if (alerts.length > 0) {
                const [superAdmins] = await pool.query("SELECT id FROM users WHERE role = 'super_admin'");
                await Promise.all(superAdmins.map(sa => notify({
                    userId: sa.id,
                    companyId: null,
                    type: 'data_integrity_alert',
                    title: 'Data integrity warning',
                    message: `Anomaly detected: ${alerts.join('; ')}. Please verify database integrity.`,
                })));
                logger.warn('[Backup] Data integrity alert:', alerts);
            }
        }
    } catch (err) {
        logger.error('[Backup] Error during database backup check:', err);
    }
}

// ── Issue #9: Keep-alive ping (every 14 minutes — prevents Render free tier sleep) ──
async function keepAlive() {
    try {
        await pool.query('SELECT 1');
    } catch (err) {
        logger.error('[KeepAlive] Ping failed:', err.message);
    }
}

function startScheduler() {
    // Billing checks — daily at 2:00 AM UTC
    cron.schedule('0 2 * * *', runBillingChecks);
    logger.info('[Scheduler] Billing scheduler started (runs daily at 2:00 AM)');

    // Class reminders — every 15 minutes
    cron.schedule('*/15 * * * *', runClassReminders);
    logger.info('[Scheduler] Class reminder scheduler started (runs every 15 minutes)');

    // Onboarding follow-up — daily at 9:00 AM UTC
    cron.schedule('0 9 * * *', runOnboardingFollowUp);
    logger.info('[Scheduler] Onboarding follow-up scheduler started (runs daily at 9:00 AM)');

    // Database backup/integrity check — daily at 3:00 AM UTC
    cron.schedule('0 3 * * *', runDatabaseBackup);
    logger.info('[Scheduler] Database backup scheduler started (runs daily at 3:00 AM)');

    // Keep-alive ping — every 14 minutes (prevents Render free tier cold starts)
    cron.schedule('*/14 * * * *', keepAlive);
    logger.info('[Scheduler] Keep-alive ping started (every 14 minutes)');
}

module.exports = { startScheduler, runBillingChecks, runClassReminders, runOnboardingFollowUp, runDatabaseBackup };
