const express = require('express');
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const notify = require('../utils/notify');

const router = express.Router();

// POST /api/waitlist — student subscribes to be notified when a slot opens
router.post('/', authenticateToken, requireRole('student'), async (req, res) => {
    try {
        const studentId = req.user.id;
        const companyId = req.user.company_id;
        const { teacher_id, desired_date, desired_time } = req.body;

        if (!teacher_id || !desired_date || !desired_time) {
            return res.status(400).json({ message: 'teacher_id, desired_date, and desired_time are required' });
        }

        // Prevent duplicate waitlist entries
        const [[existing]] = await pool.query(
            `SELECT id FROM waitlist
             WHERE student_id = ? AND company_id = ? AND teacher_id = ? AND desired_date = ? AND desired_time = ?
               AND status = 'waiting'`,
            [studentId, companyId, teacher_id, desired_date, desired_time]
        );
        if (existing) {
            return res.status(409).json({ message: 'You are already on the waitlist for this slot' });
        }

        await pool.query(
            `INSERT INTO waitlist (company_id, student_id, teacher_id, desired_date, desired_time, status)
             VALUES (?, ?, ?, ?, ?, 'waiting')`,
            [companyId, studentId, teacher_id, desired_date, desired_time]
        );

        res.status(201).json({ message: 'Added to waitlist. You will be notified when this slot opens up.' });
    } catch (err) {
        console.error('Waitlist error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/waitlist — student's own waitlist entries
router.get('/', authenticateToken, requireRole('student'), async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT w.id, w.desired_date, w.desired_time, w.status, w.created_at,
                    u.name AS teacher_name
             FROM waitlist w
             LEFT JOIN users u ON w.teacher_id = u.id
             WHERE w.student_id = ? AND w.company_id = ?
             ORDER BY w.desired_date ASC, w.desired_time ASC`,
            [req.user.id, req.user.company_id]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// DELETE /api/waitlist/:id — remove from waitlist
router.delete('/:id', authenticateToken, requireRole('student'), async (req, res) => {
    try {
        const [result] = await pool.query(
            "DELETE FROM waitlist WHERE id = ? AND student_id = ? AND status = 'waiting'",
            [req.params.id, req.user.id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Waitlist entry not found' });
        res.json({ message: 'Removed from waitlist' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * Called when a booking is cancelled — checks waitlist and notifies waiting students.
 * This is a utility function, not a route.
 */
async function notifyWaitlistForSlot(companyId, teacherId, appointmentDate) {
    try {
        const dt = new Date(appointmentDate);
        const dateStr = dt.toISOString().split('T')[0];
        const hours = String(dt.getHours()).padStart(2, '0');
        const mins = String(dt.getMinutes()).padStart(2, '0');
        const timeStr = `${hours}:${mins}`;

        const [waiters] = await pool.query(
            `SELECT id, student_id FROM waitlist
             WHERE company_id = ? AND teacher_id = ? AND desired_date = ? AND desired_time = ?
               AND status = 'waiting'`,
            [companyId, teacherId, dateStr, timeStr]
        );

        const dateDisplay = dt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
        await Promise.all(waiters.map(async (w) => {
            await notify({
                userId: w.student_id,
                companyId,
                type: 'waitlist_slot_opened',
                title: 'A slot you wanted is now available!',
                message: `The slot on ${dateDisplay} is now open. Book it before someone else does!`,
            });
            await pool.query("UPDATE waitlist SET status = 'notified' WHERE id = ?", [w.id]);
        }));
    } catch (err) {
        console.error('Waitlist notification error:', err);
    }
}

module.exports = router;
module.exports.notifyWaitlistForSlot = notifyWaitlistForSlot;
