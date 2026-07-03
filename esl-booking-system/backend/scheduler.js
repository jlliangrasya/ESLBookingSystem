const cron = require('node-cron');
const pool = require('./db');
const notify = require('./utils/notify');
const { sendMail } = require('./utils/mailer');
const logger = require('./utils/logger');
const { phtNowSql, phtTodaySql, formatPHT } = require('./utils/phtTime');

// ── Reliability notes (Render free tier) ─────────────────────────────────────
// The free tier idle-sleeps the process after ~15 min without inbound HTTP
// traffic, killing all in-memory cron timers. Three defenses:
//   1. keepAlive self-pings the public /health URL (inbound HTTP resets the
//      idle timer — a DB query does NOT).
//   2. startScheduler() runs every check once on boot, so waking up from a
//      sleep/deploy immediately catches anything still inside its window.
//   3. Daily jobs are claimed through the scheduler_runs table instead of a
//      fixed clock tick, so a missed 10:00 AM run still happens at 10:15,
//      14:00, or whenever the process is next awake that day.
// Reminder sends are claim-first (UPDATE ... WHERE reminded = FALSE), so the
// boot catch-up overlapping a cron tick can never double-send.

// ── Schema the scheduler needs (safe to run every boot) ───────────────────────
async function ensureSchedulerSchema() {
    await pool.query(`CREATE TABLE IF NOT EXISTS scheduler_runs (
        job_name VARCHAR(64) PRIMARY KEY,
        last_run_date DATE NOT NULL,
        last_run_at DATETIME NOT NULL)`);

    const addCols = [
        ['companies', 'onboarding_followup_sent', 'TINYINT(1) NOT NULL DEFAULT 0'],
        ['push_subscriptions', 'failure_count', 'INT NOT NULL DEFAULT 0'],
    ];
    for (const [table, col, def] of addCols) {
        try { await pool.query(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); }
        catch (err) { if (!err.message.includes('Duplicate column')) logger.error(`[Scheduler] Add column ${table}.${col} failed`, { error: err.message }); }
    }
}

// Atomically claim a daily job for today (PHT). Returns true if this call won
// the claim (job hasn't run today yet), false if it already ran.
// Safe under overlapping ticks and multiple instances.
async function claimDailyRun(jobName) {
    const today = phtTodaySql();
    const now = phtNowSql();
    const [result] = await pool.query(
        `INSERT INTO scheduler_runs (job_name, last_run_date, last_run_at) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           last_run_at  = IF(last_run_date < VALUES(last_run_date), VALUES(last_run_at), last_run_at),
           last_run_date = IF(last_run_date < VALUES(last_run_date), VALUES(last_run_date), last_run_date)`,
        [jobName, today, now]
    );
    // affectedRows: 1 = inserted, 2 = updated (claimed); 0 = already ran today
    return result.affectedRows > 0;
}

// ── Billing Checks (daily, PHT calendar dates) ────────────────────────────────
async function runBillingChecks() {
    logger.info('[Scheduler] Running billing checks...');

    try {
        const today = phtTodaySql();

        // A. Notify company owner 5 days before due date
        const [due5] = await pool.query(
            `SELECT c.id, c.company_name AS name FROM companies c
             WHERE c.next_due_date = ?
             AND c.status = 'active'`,
            [phtTodaySql(5)]
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
             WHERE c.next_due_date = ?
             AND c.status = 'active'`,
            [phtTodaySql(3)]
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

        // C. Auto-suspend companies past their due date (self-service recovery via suspended page)
        const [overdue] = await pool.query(
            `SELECT c.id, c.company_name AS name FROM companies c
             WHERE c.next_due_date < ?
             AND c.status = 'active'`,
            [today]
        );
        await Promise.all(overdue.map(async (company) => {
            await pool.query("UPDATE companies SET status = 'suspended' WHERE id = ?", [company.id]);
            const [owners] = await pool.query(
                "SELECT id FROM users WHERE company_id = ? AND role = 'company_admin' AND is_owner = TRUE",
                [company.id]
            );
            await Promise.all(owners.map(owner => notify({
                userId: owner.id,
                companyId: company.id,
                type: 'account_locked',
                title: 'Account suspended — payment overdue',
                message: `Your account for "${company.name}" has been suspended because the subscription payment is overdue. Please log in and complete payment to restore access.`,
            })));
            logger.warn(`[Scheduler] Suspended company (overdue): ${company.name} (id=${company.id})`);
        }));

        // D. Auto-suspend companies whose free trial has expired (self-service recovery via suspended page)
        const [expiredTrials] = await pool.query(
            `SELECT c.id, c.company_name AS name FROM companies c
             WHERE c.trial_ends_at < ?
             AND c.status = 'active'
             AND c.next_due_date IS NULL`,
            [today]
        );
        await Promise.all(expiredTrials.map(async (company) => {
            await pool.query("UPDATE companies SET status = 'suspended' WHERE id = ?", [company.id]);
            const [owners] = await pool.query(
                "SELECT id FROM users WHERE company_id = ? AND role = 'company_admin' AND is_owner = TRUE",
                [company.id]
            );
            await Promise.all(owners.map(owner => notify({
                userId: owner.id,
                companyId: company.id,
                type: 'trial_expired',
                title: 'Free trial has ended',
                message: `Your free trial for "${company.name}" has expired. Please log in and select a plan to continue using the service.`,
            })));
            logger.warn(`[Scheduler] Suspended company (trial expired): ${company.name} (id=${company.id})`);
        }));

        logger.info(`[Scheduler] Done. Notified (5d): ${due5.length}, Notified SA (3d): ${due3.length}, Suspended (overdue): ${overdue.length}, Suspended (trial expired): ${expiredTrials.length}`);
    } catch (err) {
        logger.error('[Scheduler] Error during billing checks:', err);
    }
}

// ── 5-Hour Class Reminder (runs every 15 minutes) ────────────────────────────
// appointment_date stores naive PHT wall-clock time; the window bounds are
// computed in Node (see utils/phtTime.js) so no SQL/session-TZ assumptions.
async function run5HourReminders() {
    try {
        const windowStart = phtNowSql(4 * 60);      // now + 4h  (PHT)
        const windowEnd = phtNowSql(5.5 * 60);      // now + 5.5h (PHT)
        const [upcoming] = await pool.query(`
            SELECT b.id, b.appointment_date, b.teacher_id, b.booking_group_id,
                   sp.student_id, u_student.name AS student_name,
                   u_teacher.name AS teacher_name
            FROM bookings b
            JOIN student_packages sp ON b.student_package_id = sp.id
            JOIN users u_student ON sp.student_id = u_student.id
            LEFT JOIN users u_teacher ON b.teacher_id = u_teacher.id
            WHERE b.status IN ('confirmed', 'pending')
              AND b.reminded_5h = FALSE
              AND b.appointment_date BETWEEN ? AND ?
              AND (b.booking_group_id IS NULL OR b.appointment_date = (
                  SELECT MIN(b2.appointment_date) FROM bookings b2
                  WHERE b2.booking_group_id = b.booking_group_id
              ))
        `, [windowStart, windowEnd]);

        let sent = 0;
        for (const booking of upcoming) {
            // Claim before sending — if another tick (or the boot catch-up)
            // already claimed this booking, affectedRows is 0 and we skip.
            const [claim] = booking.booking_group_id
                ? await pool.query('UPDATE bookings SET reminded_5h = TRUE WHERE booking_group_id = ? AND reminded_5h = FALSE', [booking.booking_group_id])
                : await pool.query('UPDATE bookings SET reminded_5h = TRUE WHERE id = ? AND reminded_5h = FALSE', [booking.id]);
            if (claim.affectedRows === 0) continue;
            sent++;

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
        }

        // Heartbeat: always log, even on 0 — distinguishes "ran, nothing due"
        // from "never ran" (asleep) when reading Render logs.
        logger.info(`[Scheduler] 5-hour reminder check: ${sent}/${upcoming.length} sent (window ${windowStart} → ${windowEnd} PHT)`);
    } catch (err) {
        logger.error('[Scheduler] Error during 5-hour reminders:', err);
    }
}

// ── 30-Minute Class Reminder (runs every 10 minutes) ─────────────────────────
async function run30MinReminders() {
    try {
        const windowStart = phtNowSql(0);           // now (PHT)
        const windowEnd = phtNowSql(40);            // now + 40min (PHT)
        const [upcoming] = await pool.query(`
            SELECT b.id, b.appointment_date, b.teacher_id, b.class_mode, b.meeting_link, b.booking_group_id,
                   sp.student_id, u_student.name AS student_name, u_student.email AS student_email,
                   u_teacher.name AS teacher_name, u_teacher.email AS teacher_email
            FROM bookings b
            JOIN student_packages sp ON b.student_package_id = sp.id
            JOIN users u_student ON sp.student_id = u_student.id
            LEFT JOIN users u_teacher ON b.teacher_id = u_teacher.id
            WHERE b.status IN ('confirmed', 'pending')
              AND b.reminded = FALSE
              AND b.appointment_date BETWEEN ? AND ?
              AND (b.booking_group_id IS NULL OR b.appointment_date = (
                  SELECT MIN(b2.appointment_date) FROM bookings b2
                  WHERE b2.booking_group_id = b.booking_group_id
              ))
        `, [windowStart, windowEnd]);

        let sent = 0;
        for (const booking of upcoming) {
            const [claim] = booking.booking_group_id
                ? await pool.query('UPDATE bookings SET reminded = TRUE WHERE booking_group_id = ? AND reminded = FALSE', [booking.booking_group_id])
                : await pool.query('UPDATE bookings SET reminded = TRUE WHERE id = ? AND reminded = FALSE', [booking.id]);
            if (claim.affectedRows === 0) continue;
            sent++;

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
        }

        logger.info(`[Scheduler] 30-min reminder check: ${sent}/${upcoming.length} sent (window ${windowStart} → ${windowEnd} PHT)`);
    } catch (err) {
        logger.error('[Scheduler] Error during 30-min reminders:', err);
    }
}

// ── Issue #14: Company Onboarding Follow-up (daily) ────────────────────────────
async function runOnboardingFollowUp() {
    try {
        // Every pending company older than 48h that hasn't had a follow-up yet.
        // (Flag-based, not a time window: the old 48-49h window only caught
        // companies registered in one specific hour of the day.)
        const [stalePending] = await pool.query(`
            SELECT c.id, c.company_name, c.company_email, c.created_at
            FROM companies c
            WHERE c.status = 'pending'
              AND c.onboarding_followup_sent = 0
              AND c.created_at < DATE_SUB(NOW(), INTERVAL 48 HOUR)
        `);

        if (stalePending.length > 0) {
            const [superAdmins] = await pool.query("SELECT id FROM users WHERE role = 'super_admin'");
            for (const company of stalePending) {
                await pool.query('UPDATE companies SET onboarding_followup_sent = 1 WHERE id = ?', [company.id]);

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

// ── Issue #12: Database Backup (daily) ──────────────────────────────────────────
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

// ── Daily job sweep ───────────────────────────────────────────────────────────
// Daily jobs run at a target PHT hour, but through claimDailyRun() rather than
// a one-shot cron tick: the sweep runs every 15 min and on boot, so if the
// server was asleep at the target time, the job still runs at the next moment
// the process is awake that day — exactly once.
const DAILY_JOBS = [
    { name: 'billing_checks', targetHourPHT: 10, run: runBillingChecks },        // was 2:00 UTC
    { name: 'database_backup', targetHourPHT: 11, run: runDatabaseBackup },      // was 3:00 UTC
    { name: 'onboarding_followup', targetHourPHT: 17, run: runOnboardingFollowUp }, // was 9:00 UTC
];

async function runDailyJobsSweep() {
    const hourPHT = Number(phtNowSql().slice(11, 13));
    for (const job of DAILY_JOBS) {
        if (hourPHT < job.targetHourPHT) continue;
        try {
            if (await claimDailyRun(job.name)) {
                logger.info(`[Scheduler] Daily job '${job.name}' claimed for ${phtTodaySql()} (PHT), running`);
                await job.run();
            }
        } catch (err) {
            logger.error(`[Scheduler] Daily job '${job.name}' failed:`, err);
        }
    }
}

// ── Keep-alive (every 10 minutes — prevents Render free tier idle sleep) ──────
// Render's idle detector counts INBOUND HTTP traffic, so we must ping our own
// public URL (RENDER_EXTERNAL_URL is set automatically by Render). A plain DB
// query does not count and does NOT keep the service awake.
async function keepAlive() {
    const baseUrl = process.env.RENDER_EXTERNAL_URL;
    if (baseUrl && typeof fetch === 'function') {
        try {
            const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(20000) });
            if (!res.ok) logger.warn(`[KeepAlive] Self-ping returned ${res.status}`);
        } catch (err) {
            logger.error('[KeepAlive] Self-ping failed:', err.message);
        }
    } else {
        try {
            await pool.query('SELECT 1');
        } catch (err) {
            logger.error('[KeepAlive] DB ping failed:', err.message);
        }
    }
}

async function startScheduler() {
    try {
        await ensureSchedulerSchema();
    } catch (err) {
        logger.error('[Scheduler] Schema check failed (continuing):', err);
    }

    // timezone pinned so cron evaluation never depends on the host's clock
    // settings; noOverlap prevents a slow run from stacking with the next tick.
    const opts = { timezone: 'Etc/UTC', noOverlap: true };

    cron.schedule('*/10 * * * *', run30MinReminders, opts);
    cron.schedule('*/15 * * * *', run5HourReminders, opts);
    cron.schedule('*/15 * * * *', runDailyJobsSweep, opts);
    cron.schedule('*/10 * * * *', keepAlive, opts);
    logger.info('[Scheduler] Cron jobs registered (30-min reminders q10m, 5-hour reminders q15m, daily sweep q15m, keep-alive q10m)');

    // Boot catch-up: the server may have just woken from an idle sleep or a
    // deploy — check immediately instead of waiting for the next tick.
    // Claim-first updates make this safe to run alongside the cron ticks.
    setTimeout(() => {
        logger.info('[Scheduler] Boot catch-up: running all checks now');
        run30MinReminders();
        run5HourReminders();
        runDailyJobsSweep();
    }, 5000);
}

module.exports = { startScheduler, runBillingChecks, run5HourReminders, run30MinReminders, runOnboardingFollowUp, runDatabaseBackup };
