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

// TTL 1h: a class reminder delivered hours late (device offline, push service
// backlog) is worse than not delivered — let it expire instead.
const SEND_OPTIONS = { TTL: 3600, urgency: 'high' };

// Subscriptions that fail this many sends in a row (without a single success)
// are considered dead and removed.
const MAX_CONSECUTIVE_FAILURES = 8;

// No statusCode = network-level error. 429/5xx = transient on the push service side.
function isRetryable(err) {
    return !err.statusCode || err.statusCode === 429 || err.statusCode >= 500;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sendWithRetry(sub, payload) {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await sleep(attempt * 3000);
        try {
            return await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                payload,
                SEND_OPTIONS
            );
        } catch (err) {
            lastErr = err;
            if (!isRetryable(err)) throw err;
        }
    }
    throw lastErr;
}

async function sendPushToUser(userId, { title, message, type }) {
    if (!isConfigured()) {
        logger.warn('Push not configured — VAPID keys missing');
        return;
    }
    try {
        const [subscriptions] = await pool.query(
            'SELECT id, endpoint, p256dh, auth, failure_count FROM push_subscriptions WHERE user_id = ?',
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
                const result = await sendWithRetry(sub, payload);
                logger.info('Push sent successfully', { userId, statusCode: result.statusCode, endpoint: sub.endpoint.slice(0, 60) });
                if (sub.failure_count > 0) {
                    await pool.query('UPDATE push_subscriptions SET failure_count = 0 WHERE id = ?', [sub.id]);
                }
            } catch (err) {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    await pool.query('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
                    logger.info('Removed stale push subscription', { subId: sub.id, userId });
                } else {
                    const failures = (sub.failure_count || 0) + 1;
                    if (failures >= MAX_CONSECUTIVE_FAILURES) {
                        await pool.query('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
                        logger.warn('Removed push subscription after repeated failures', { subId: sub.id, userId, failures, error: err.message });
                    } else {
                        await pool.query('UPDATE push_subscriptions SET failure_count = failure_count + 1 WHERE id = ?', [sub.id]);
                        logger.error('Push send failed', { error: err.message, statusCode: err.statusCode, failures, endpoint: sub.endpoint.slice(0, 60) });
                    }
                }
            }
        }));
    } catch (err) {
        logger.error('sendPushToUser error', { error: err.message, userId });
    }
}

module.exports = { sendPushToUser, isConfigured };
