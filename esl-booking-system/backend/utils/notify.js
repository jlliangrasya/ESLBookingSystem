const pool = require('../db');
const { getIO } = require('../socket');
const logger = require('./logger');

/**
 * Create a notification in DB and emit it via socket.io to the recipient.
 * @param {object} opts
 * @param {number}  opts.userId     - recipient user ID
 * @param {number|null} opts.companyId - company context (NULL for super_admin)
 * @param {string}  opts.type      - e.g. 'new_company', 'new_student', 'booking_created'
 * @param {string}  opts.title     - short title shown in the bell
 * @param {string}  [opts.message] - optional longer description
 */
/**
 * Fire-and-forget: caller does NOT need to await this function.
 * DB insert and socket emit happen in the background; failures are logged but never block the caller.
 */
function notify({ userId, companyId = null, type, title, message = '' }) {
    // Intentionally not returning the promise — callers should not await
    (async () => {
        try {
            const [result] = await pool.query(
                'INSERT INTO notifications (user_id, company_id, type, title, message) VALUES (?, ?, ?, ?, ?)',
                [userId, companyId, type, title, message]
            );
            const [[row]] = await pool.query('SELECT * FROM notifications WHERE id = ?', [result.insertId]);

            const io = getIO();
            if (io) {
                io.to(`user:${userId}`).emit('notification', row);
            }
        } catch (err) {
            logger.error('Notify error:', { error: err.message, userId, type });
        }
    })();
}

module.exports = notify;
