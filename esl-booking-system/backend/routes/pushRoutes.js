const express = require('express');
const router = express.Router();
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');
const logger = require('../utils/logger');

// GET /api/push/vapid-public-key — no auth required
router.get('/vapid-public-key', (req, res) => {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
});

// POST /api/push/subscribe — register or update a push subscription
router.post('/subscribe', authenticateToken, async (req, res) => {
    try {
        const { endpoint, keys } = req.body;
        if (!endpoint || !keys?.p256dh || !keys?.auth) {
            return res.status(400).json({ message: 'Missing subscription data' });
        }

        await pool.query(
            `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth), user_agent = VALUES(user_agent)`,
            [req.user.id, endpoint, keys.p256dh, keys.auth, req.headers['user-agent'] || null]
        );

        res.status(201).json({ message: 'Subscribed' });
    } catch (err) {
        logger.error('Push subscribe error:', { error: err.message });
        res.status(500).json({ message: 'Failed to subscribe' });
    }
});

// DELETE /api/push/unsubscribe — remove a push subscription
router.delete('/unsubscribe', authenticateToken, async (req, res) => {
    try {
        const { endpoint } = req.body;
        if (!endpoint) {
            return res.status(400).json({ message: 'Missing endpoint' });
        }

        await pool.query(
            'DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?',
            [req.user.id, endpoint]
        );

        res.json({ message: 'Unsubscribed' });
    } catch (err) {
        logger.error('Push unsubscribe error:', { error: err.message });
        res.status(500).json({ message: 'Failed to unsubscribe' });
    }
});

// POST /api/push/test — send a test push to the authenticated user
router.post('/test', authenticateToken, async (req, res) => {
    try {
        const { sendPushToUser, isConfigured } = require('../utils/pushService');
        if (!isConfigured()) {
            return res.status(500).json({ message: 'VAPID not configured on server' });
        }
        await sendPushToUser(req.user.id, {
            title: 'Test Notification',
            message: 'If you see this, push notifications are working!',
            type: 'test',
        });
        res.json({ message: 'Push sent (check device)' });
    } catch (err) {
        logger.error('Push test error:', { error: err.message });
        res.status(500).json({ message: 'Push test failed', error: err.message });
    }
});

module.exports = router;
