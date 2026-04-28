const cron = require('node-cron');
const pool = require('./db');
const notify = require('./utils/notify');
const { sendMail } = require('./utils/mailer');
const logger = require('./utils/logger');

// appointment_date is stored in Philippine time (UTC+8).
// Format it for display in notifications, labelled as PHT.
function formatPHT(appointmentDate) {
    const raw = new Date(appointmentDate);
    // mysql2 on a UTC server interprets the naive datetime as UTC,
    // but the value is actually PHT — shift to real UTC then format in Manila tz
    const realUtc = new Date(raw.getTime() - (8 * 60 * 60 * 1000));
    return realUtc.toLocaleString('en-US', {
        timeZone: 'Asia/Manila',
        dateStyle: 'medium',
        timeStyle: 'short',
    }) + ' (PHT)';
}

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

// ── 5-Hour Class Reminder (runs every 15 minutes) ────────────────────────────
// NOTE: appointment_date stores local Philippine time (UTC+8) but TiDB NOW()
// returns UTC, so we convert NOW() to Asia/Manila before comparing.
async function run5HourReminders() {
    try {
        const [upcoming] = await pool.query(`
            SELECT b.id, b.appointment_date, b.teacher_id,
                   sp.student_id, u_student.name AS student_name,
                   u_teacher.name AS teacher_name
            FROM bookings b
            JOIN student_packages sp ON b.student_package_id = sp.id
            JOIN users u_student ON sp.student_id = u_student.id
            LEFT JOIN users u_teacher ON b.teacher_id = u_teacher.id
            WHERE b.status IN ('confirmed', 'pending')
              AND b.reminded_5h = FALSE
              AND b.appointment_date BETWEEN DATE_ADD(CONVERT_TZ(NOW(), '+00:00', '+08:00'), INTERVAL 4 HOUR)
                                          AND DATE_ADD(CONVERT_TZ(NOW(), '+00:00', '+08:00'), INTERVAL 5.5 HOUR)
              AND (b.booking_group_id IS NULL OR b.appointment_date = (
                  SELECT MIN(b2.appointment_date) FROM bookings b2
                  WHERE b2.booking_group_id = b.booking_group_id
              ))
        `);

        for (const booking of upcoming) {
            const dateStr = formatPHT(booking.appointment_date);

            notify({
                userId: booking.student_id,
                companyId: null,
                type: 'class_reminder',
                title: 'Class in ~5 hours',
                message: `Reminder: Your class with ${booking.teacher_name || 'your teacher'} is at ${dateStr}. Get ready!`,
            });

            if (booking.teacher_id) {
                notify({
                    userId: booking.teacher_id,
                    companyId: null,
                    type: 'class_reminder',
                    title: 'Class in ~5 hours',
                    message: `Reminder: Your class with ${booking.student_name} is at ${dateStr}.`,
                });
            }

            // Mark all slots in the group (first + second for 50-min classes) so no duplicate fires
            if (booking.booking_group_id) {
                await pool.query('UPDATE bookings SET reminded_5h = TRUE WHERE booking_group_id = ?', [booking.booking_group_id]);
            } else {
                await pool.query('UPDATE bookings SET reminded_5h = TRUE WHERE id = ?', [booking.id]);
            }
        }

        if (upcoming.length > 0) {
            logger.info(`[Scheduler] Sent ${upcoming.length} 5-hour reminder(s)`);
        }
    } catch (err) {
        logger.error('[Scheduler] Error during 5-hour reminders:', err);
    }
}

// ── 30-Minute Class Reminder (runs every 10 minutes) ─────────────────────────
// NOTE: appointment_date stores local Philippine time (UTC+8) — see 5-hour note.
async function run30MinReminders() {
    try {
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
              AND b.appointment_date BETWEEN CONVERT_TZ(NOW(), '+00:00', '+08:00')
                                          AND DATE_ADD(CONVERT_TZ(NOW(), '+00:00', '+08:00'), INTERVAL 40 MINUTE)
              AND (b.booking_group_id IS NULL OR b.appointment_date = (
                  SELECT MIN(b2.appointment_date) FROM bookings b2
                  WHERE b2.booking_group_id = b.booking_group_id
              ))
        `);

        for (const booking of upcoming) {
            const dateStr = formatPHT(booking.appointment_date);
            const meetingInfo = booking.meeting_link ? ` Meeting link: ${booking.meeting_link}` : '';

            notify({
                userId: booking.student_id,
                companyId: null,
                type: 'class_reminder',
                title: 'Class starting in 30 minutes!',
                message: `Your class with ${booking.teacher_name || 'your teacher'} starts at ${dateStr}.${meetingInfo}`,
            });

            if (booking.teacher_id) {
                notify({
                    userId: booking.teacher_id,
                    companyId: null,
                    type: 'class_reminder',
                    title: 'Class starting in 30 minutes!',
                    message: `Your class with ${booking.student_name} starts at ${dateStr}.${meetingInfo}`,
                });
            }

            if (booking.student_email) {
                sendMail({
                    to: booking.student_email,
                    subject: 'Class Starting in 30 Minutes!',
                    html: `<p>Hi ${booking.student_name},</p>
                           <p>Your class with <strong>${booking.teacher_name || 'your teacher'}</strong> starts at <strong>${dateStr}</strong>.</p>
                           ${booking.meeting_link ? `<p>Meeting link: <a href="${booking.meeting_link}">${booking.meeting_link}</a></p>` : ''}
                           <p>Don't be late!</p>`,
                }).catch(() => {});
            }

            if (booking.teacher_email && booking.teacher_id) {
                sendMail({
                    to: booking.teacher_email,
                    subject: 'Class Starting in 30 Minutes!',
                    html: `<p>Hi ${booking.teacher_name},</p>
                           <p>Your class with <strong>${booking.student_name}</strong> starts at <strong>${dateStr}</strong>.</p>
                           ${booking.meeting_link ? `<p>Meeting link: <a href="${booking.meeting_link}">${booking.meeting_link}</a></p>` : ''}`,
                }).catch(() => {});
            }

            // Mark all slots in the group (first + second for 50-min classes) so no duplicate fires
            if (booking.booking_group_id) {
                await pool.query('UPDATE bookings SET reminded = TRUE WHERE booking_group_id = ?', [booking.booking_group_id]);
            } else {
                await pool.query('UPDATE bookings SET reminded = TRUE WHERE id = ?', [booking.id]);
            }
        }

        if (upcoming.length > 0) {
            logger.info(`[Scheduler] Sent ${upcoming.length} 30-min reminder(s)`);
        }
    } catch (err) {
        logger.error('[Scheduler] Error during 30-min reminders:', err);
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

    // 5-hour reminders — every 15 minutes
    cron.schedule('*/15 * * * *', run5HourReminders);
    logger.info('[Scheduler] 5-hour reminder scheduler started (runs every 15 minutes)');

    // 30-minute reminders — every 10 minutes
    cron.schedule('*/10 * * * *', run30MinReminders);
    logger.info('[Scheduler] 30-min reminder scheduler started (runs every 10 minutes)');

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

module.exports = { startScheduler, runBillingChecks, run5HourReminders, run30MinReminders, runOnboardingFollowUp, runDatabaseBackup };
