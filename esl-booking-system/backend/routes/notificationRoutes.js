const express = require('express');
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

// GET /api/notifications — logged-in user's notifications (paginated)
router.get('/', authenticateToken, async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const offset = (page - 1) * limit;

        const [rows] = await pool.query(
            'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
            [req.user.id, limit, offset]
        );
        const [[{ total }]] = await pool.query(
            'SELECT COUNT(*) AS total FROM notifications WHERE user_id = ?',
            [req.user.id]
        );
        res.json({ data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/notifications/unread-count
router.get('/unread-count', authenticateToken, async (req, res) => {
    try {
        const [[row]] = await pool.query(
            'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = FALSE',
            [req.user.id]
        );
        res.json({ count: row.count });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/notifications/:id/read — mark one as read
router.post('/:id/read', authenticateToken, async (req, res) => {
    try {
        await pool.query(
            'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
            [req.params.id, req.user.id]
        );
        res.json({ message: 'Marked as read' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/notifications/read-all — mark all as read for this user
router.post('/read-all', authenticateToken, async (req, res) => {
    try {
        await pool.query(
            'UPDATE notifications SET is_read = TRUE WHERE user_id = ?',
            [req.user.id]
        );
        res.json({ message: 'All marked as read' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
