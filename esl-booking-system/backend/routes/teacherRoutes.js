const express = require('express');
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

// Teacher dashboard — assigned students and upcoming bookings
router.get('/dashboard', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const teacherId = req.user.id;
        const companyId = req.user.company_id;

        // Teacher's profile
        const [[teacher]] = await pool.query(
            'SELECT id, name, email FROM users WHERE id = ?',
            [teacherId]
        );

        // Assigned students (via student_packages)
        const [students] = await pool.query(`
            SELECT
                u.id, u.name, u.nationality, u.age,
                tp.package_name,
                sp.sessions_remaining,
                sp.subject,
                sp.payment_status
            FROM student_packages sp
            JOIN users u ON sp.student_id = u.id
            JOIN tutorial_packages tp ON sp.package_id = tp.id
            WHERE sp.teacher_id = ? AND sp.company_id = ?
            ORDER BY u.name ASC
        `, [teacherId, companyId]);

        // Upcoming bookings for this teacher
        const [bookings] = await pool.query(`
            SELECT
                b.id,
                b.appointment_date,
                b.status,
                u.name AS student_name,
                tp.package_name,
                sp.subject
            FROM bookings b
            JOIN student_packages sp ON b.student_package_id = sp.id
            JOIN users u ON sp.student_id = u.id
            JOIN tutorial_packages tp ON sp.package_id = tp.id
            WHERE b.teacher_id = ? AND b.company_id = ? AND b.appointment_date >= NOW()
            ORDER BY b.appointment_date ASC
        `, [teacherId, companyId]);

        res.json({ teacher, students, bookings });
    } catch (err) {
        console.error('Error fetching teacher dashboard:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

module.exports = router;
