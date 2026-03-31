const express = require('express');
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

/** Convert rows to CSV string */
function toCSV(rows, columns) {
    if (!rows.length) return columns.join(',') + '\n';
    const header = columns.join(',');
    const body = rows.map(row =>
        columns.map(col => {
            const val = row[col];
            if (val === null || val === undefined) return '';
            const str = String(val).replace(/"/g, '""');
            return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
        }).join(',')
    ).join('\n');
    return header + '\n' + body + '\n';
}

// GET /api/export/students — export student list as CSV
router.get('/students', authenticateToken, requireRole('company_admin'), async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const [rows] = await pool.query(`
            SELECT u.name, u.email, u.guardian_name, u.nationality, u.age, u.created_at,
                   tp.package_name, sp.payment_status, sp.sessions_remaining, sp.purchased_at
            FROM users u
            LEFT JOIN (
                SELECT sp2.*, ROW_NUMBER() OVER (PARTITION BY sp2.student_id ORDER BY
                    CASE WHEN sp2.payment_status = 'paid' AND sp2.sessions_remaining > 0 THEN 0 ELSE 1 END,
                    sp2.purchased_at DESC) AS rn
                FROM student_packages sp2 WHERE sp2.company_id = ?
            ) sp ON u.id = sp.student_id AND sp.rn = 1
            LEFT JOIN tutorial_packages tp ON sp.package_id = tp.id
            WHERE u.role = 'student' AND u.company_id = ?
            ORDER BY u.name ASC
        `, [companyId, companyId]);

        const columns = ['name', 'email', 'guardian_name', 'nationality', 'age', 'created_at', 'package_name', 'payment_status', 'sessions_remaining', 'purchased_at'];
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="students.csv"');
        res.send(toCSV(rows, columns));
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/export/bookings — export booking history as CSV
router.get('/bookings', authenticateToken, requireRole('company_admin'), async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const [rows] = await pool.query(`
            SELECT b.id, b.appointment_date, b.status,
                   u_student.name AS student_name, u_teacher.name AS teacher_name,
                   tp.package_name, b.class_mode, b.teacher_absent, b.student_absent, b.created_at
            FROM bookings b
            JOIN student_packages sp ON b.student_package_id = sp.id
            JOIN users u_student ON sp.student_id = u_student.id
            LEFT JOIN users u_teacher ON b.teacher_id = u_teacher.id
            JOIN tutorial_packages tp ON sp.package_id = tp.id
            WHERE b.company_id = ?
            ORDER BY b.appointment_date DESC
        `, [companyId]);

        const columns = ['id', 'appointment_date', 'status', 'student_name', 'teacher_name', 'package_name', 'class_mode', 'teacher_absent', 'student_absent', 'created_at'];
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="bookings.csv"');
        res.send(toCSV(rows, columns));
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/export/payments — export payment records as CSV (super_admin)
router.get('/payments', authenticateToken, requireRole('company_admin'), async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const [rows] = await pool.query(`
            SELECT sp.id AS enrollment_id, u.name AS student_name, tp.package_name, tp.price,
                   sp.payment_status, sp.sessions_remaining, sp.purchased_at,
                   tp.session_limit
            FROM student_packages sp
            JOIN users u ON sp.student_id = u.id
            JOIN tutorial_packages tp ON sp.package_id = tp.id
            WHERE sp.company_id = ?
            ORDER BY sp.purchased_at DESC
        `, [companyId]);

        const columns = ['enrollment_id', 'student_name', 'package_name', 'price', 'payment_status', 'session_limit', 'sessions_remaining', 'purchased_at'];
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="payment_records.csv"');
        res.send(toCSV(rows, columns));
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/export/reports — export class reports as CSV
router.get('/reports', authenticateToken, requireRole('company_admin'), async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const [rows] = await pool.query(`
            SELECT cr.id, b.appointment_date, u_student.name AS student_name, u_teacher.name AS teacher_name,
                   cr.new_words, cr.sentences, cr.notes, cr.remarks, cr.created_at
            FROM class_reports cr
            JOIN bookings b ON cr.booking_id = b.id
            JOIN users u_student ON cr.student_id = u_student.id
            JOIN users u_teacher ON cr.teacher_id = u_teacher.id
            WHERE cr.company_id = ?
            ORDER BY b.appointment_date DESC
        `, [companyId]);

        const columns = ['id', 'appointment_date', 'student_name', 'teacher_name', 'new_words', 'sentences', 'notes', 'remarks', 'created_at'];
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="class_reports.csv"');
        res.send(toCSV(rows, columns));
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
