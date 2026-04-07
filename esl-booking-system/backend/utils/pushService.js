const webpush = require('web-push');
const pool = require('../db');
const logger = require('./logger');

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:admin@brightfolks.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
    logger.info('Web Push VAPID configured');
} else {
    logger.warn('Web Push VAPID NOT configured — missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY');
}

function isConfigured() {
    return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

async function sendPushToUser(userId, { title, message, type }) {
    if (!isConfigured()) {
        logger.warn('Push not configured — VAPID keys missing');
        return;
    }
    try {
        const [subscriptions] = await pool.query(
            'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
            [userId]
        );
        if (subscriptions.length === 0) {
            logger.info('No push subscriptions for user', { userId });
            return;
        }
        logger.info('Sending push to user', { userId, subscriptionCount: subscriptions.length });

        const payload = JSON.stringify({ title, body: message, type });

        await Promise.allSettled(subscriptions.map(async (sub) => {
            try {
                const result = await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                    payload
                );
                logger.info('Push sent successfully', { userId, statusCode: result.statusCode, endpoint: sub.endpoint.slice(0, 60) });
            } catch (err) {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    await pool.query('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
                    logger.info('Removed stale push subscription', { subId: sub.id, userId });
                } else {
                    logger.error('Push send failed', { error: err.message, endpoint: sub.endpoint });
                }
            }
        }));
    } catch (err) {
        logger.error('sendPushToUser error', { error: err.message, userId });
    }
}

module.exports = { sendPushToUser, isConfigured };
