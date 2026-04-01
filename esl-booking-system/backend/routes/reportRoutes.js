const express = require('express');
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const notify = require('../utils/notify');

const router = express.Router();

// POST /api/reports — teacher submits a report after class is marked done
router.post('/', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const { booking_id, student_id, new_words, sentences, notes, remarks } = req.body;
        const teacherId = req.user.id;
        const companyId = req.user.company_id;

        if (!booking_id || !student_id) {
            return res.status(400).json({ message: 'booking_id and student_id are required' });
        }

        // Verify booking belongs to this company, is done, and assigned to this teacher
        const [[booking]] = await pool.query(
            "SELECT * FROM bookings WHERE id = ? AND company_id = ? AND status = 'done' AND teacher_id = ?",
            [booking_id, companyId, teacherId]
        );
        if (!booking) {
            return res.status(403).json({ message: 'You are not authorized to submit a report for this booking. Only the assigned teacher can submit.' });
        }

        // Upsert report (one per booking)
        await pool.query(
            `INSERT INTO class_reports (company_id, booking_id, teacher_id, student_id, new_words, sentences, notes, remarks)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               new_words = VALUES(new_words),
               sentences = VALUES(sentences),
               notes = VALUES(notes),
               remarks = VALUES(remarks)`,
            [companyId, booking_id, teacherId, student_id, new_words || null, sentences || null, notes || null, remarks || null]
        );

        // Notify student
        const [[teacher]] = await pool.query('SELECT name FROM users WHERE id = ?', [teacherId]);
        await notify({
            userId: student_id,
            companyId,
            type: 'report_received',
            title: 'New class report',
            message: `${teacher.name} has submitted a report for your recent class.`,
        });

        res.status(201).json({ message: 'Report submitted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/reports/booking/:booking_id — get report for a specific booking
// Role-based: students can only see their own reports, teachers only their own
router.get('/booking/:booking_id', authenticateToken, async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const userId = req.user.id;
        const role = req.user.role;

        let query = `SELECT cr.*, t.name AS teacher_name, u.name AS student_name,
                    b.appointment_date
             FROM class_reports cr
             JOIN users t ON cr.teacher_id = t.id
             JOIN users u ON cr.student_id = u.id
             JOIN bookings b ON cr.booking_id = b.id
             WHERE cr.booking_id = ? AND cr.company_id = ?`;
        const params = [req.params.booking_id, companyId];

        if (role === 'student') {
            query += ' AND cr.student_id = ?';
            params.push(userId);
        } else if (role === 'teacher') {
            query += ' AND cr.teacher_id = ?';
            params.push(userId);
        }

        const [[report]] = await pool.query(query, params);
        if (!report) return res.status(404).json({ message: 'Report not found' });
        res.json(report);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/reports/student — all reports for the logged-in student
router.get('/student', authenticateToken, requireRole('student'), async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT cr.*, t.name AS teacher_name, b.appointment_date
             FROM class_reports cr
             JOIN users t ON cr.teacher_id = t.id
             JOIN bookings b ON cr.booking_id = b.id
             WHERE cr.student_id = ? AND cr.company_id = ?
             ORDER BY cr.created_at DESC`,
            [req.user.id, req.user.company_id]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
