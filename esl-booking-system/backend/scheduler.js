const cron = require('node-cron');
const pool = require('./db');
const notify = require('./utils/notify');
const logger = require('./utils/logger');

async function runBillingChecks() {
    logger.info('[Scheduler] Running billing checks...');

    try {
        // A. Notify company owner 5 days before due date
        const [due5] = await pool.query(
            `SELECT c.id, c.name FROM companies c
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
            `SELECT c.id, c.name FROM companies c
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
            `SELECT c.id, c.name FROM companies c
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

        logger.info(`[Scheduler] Done. Notified (5d): ${due5.length}, Notified SA (3d): ${due3.length}, Locked: ${overdue.length}`);
    } catch (err) {
        logger.error('[Scheduler] Error during billing checks:', err);
    }
}

function startScheduler() {
    // Run every day at 2:00 AM
    cron.schedule('0 2 * * *', runBillingChecks, { timezone: 'Asia/Manila' });
    logger.info('[Scheduler] Billing scheduler started (runs daily at 2:00 AM PHT)');
}

module.exports = { startScheduler, runBillingChecks };
