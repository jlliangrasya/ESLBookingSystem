const pool = require('../db');
const { getIO } = require('../socket');
const logger = require('./logger');
const { sendPushToUser } = require('./pushService');
const { CATEGORY_BY_TYPE, parseMuted } = require('./notificationCategories');

/**
 * True when the recipient is a sub-admin who has been opted out of this
 * notification's category. The owner and non-admin roles always receive.
 */
async function isMuted(userId, type) {
    const category = CATEGORY_BY_TYPE[type];
    if (!category) return false;
    try {
        const [[row]] = await pool.query(
            `SELECT u.role, u.is_owner, ap.muted_notifications
             FROM users u LEFT JOIN admin_permissions ap ON ap.user_id = u.id
             WHERE u.id = ?`,
            [userId]
        );
        if (!row || row.role !== 'company_admin' || row.is_owner) return false;
        return parseMuted(row.muted_notifications).includes(category);
    } catch (err) {
        // Fail open: a preference lookup problem must never swallow notifications
        logger.error('Notification preference check failed', { error: err.message, userId, type });
        return false;
    }
}

/**
 * Create a notification in DB and emit it via socket.io to the recipient.
 * @param {object} opts
 * @param {number}  opts.userId     - recipient user ID
 * @param {number|null} opts.companyId - company context (NULL for super_admin)
 * @param {string}  opts.type      - e.g. 'new_company', 'new_student', 'booking_created'
 * @param {string}  opts.title     - short title shown in the bell
 * @param {string}  [opts.message] - optional longer description
 * @param {string}  [opts.link]    - in-app path to open when the bell item is
 *                                   clicked, e.g. '/students?invite=1'. Must be
 *                                   a same-origin path, not an absolute URL.
 */
/**
 * Fire-and-forget: caller does NOT need to await this function.
 * DB insert and socket emit happen in the background; failures are logged but never block the caller.
 */
function notify({ userId, companyId = null, type, title, message = '', link = null }) {
    // Intentionally not returning the promise — callers should not await
    (async () => {
        try {
            if (await isMuted(userId, type)) return;
            const [result] = await pool.query(
                'INSERT INTO notifications (user_id, company_id, type, title, message, link) VALUES (?, ?, ?, ?, ?, ?)',
                [userId, companyId, type, title, message, link]
            );
            const [[row]] = await pool.query('SELECT * FROM notifications WHERE id = ?', [result.insertId]);

            const io = getIO();
            if (io) {
                io.to(`user:${userId}`).emit('notification', row);
            }

            await sendPushToUser(userId, { title, message, type });
        } catch (err) {
            logger.error('Notify error:', { error: err.message, userId, type });
        }
    })();
}

module.exports = notify;
