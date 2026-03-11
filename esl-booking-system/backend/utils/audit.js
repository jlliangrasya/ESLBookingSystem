const pool = require('../db');
const logger = require('./logger');

/**
 * Log an admin/system action to the audit_logs table.
 * Silently fails so it never breaks the main request.
 */
async function logAction(companyId, userId, action, targetType = null, targetId = null, details = null) {
    try {
        await pool.query(
            `INSERT INTO audit_logs (company_id, user_id, action, target_type, target_id, details)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [companyId || null, userId || null, action, targetType || null, targetId || null,
             details ? JSON.stringify(details) : null]
        );
    } catch (err) {
        logger.error('[audit] Failed to log action:', { error: err.message });
    }
}

module.exports = { logAction };
