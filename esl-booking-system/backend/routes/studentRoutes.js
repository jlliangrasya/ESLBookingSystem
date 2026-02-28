const express = require('express');
const router = express.Router();
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');

// Student dashboard
router.get('/dashboard', authenticateToken, requireRole('student'), async (req, res) => {
    try {
        const userId = req.user.id;
        const companyId = req.user.company_id;

        const [studentRows] = await pool.query(
            'SELECT * FROM users WHERE id = ? AND company_id = ?',
            [userId, companyId]
        );
        if (studentRows.length === 0) {
            return res.status(404).json({ message: "Student not found" });
        }
        const student = studentRows[0];

        const [packageRows] = await pool.query(
            `SELECT tp.id, tp.package_name, sp.sessions_remaining, tp.price
             FROM student_packages sp
             JOIN tutorial_packages tp ON sp.package_id = tp.id
             WHERE sp.student_id = ? AND sp.company_id = ?`,
            [userId, companyId]
        );
        const packageDetails = packageRows.length > 0 ? packageRows[0] : null;

        let bookings = [];
        if (packageDetails) {
            const [spRows] = await pool.query(
                'SELECT id FROM student_packages WHERE student_id = ? AND company_id = ?',
                [userId, companyId]
            );
            const studentPackage = spRows[0];

            if (studentPackage) {
                const [bookingRows] = await pool.query(
                    'SELECT * FROM bookings WHERE student_package_id = ? AND company_id = ?',
                    [studentPackage.id, companyId]
                );
                bookings = bookingRows.map(booking => {
                    const appointmentDate = new Date(booking.appointment_date);
                    return {
                        id: booking.id,
                        appointment_date: appointmentDate.toISOString().split('T')[0],
                        timeslot: appointmentDate.toLocaleTimeString('en-US', {
                            hour: '2-digit', minute: '2-digit', hour12: true,
                        }),
                        status: booking.status,
                    };
                });
            }
        }

        res.json({ student, package: packageDetails, bookings });
    } catch (error) {
        console.error("Error fetching student dashboard:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

// All students in this company (company_admin only)
router.get("/students", authenticateToken, requireRole('company_admin'), async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const [rows] = await pool.query(`
            SELECT
                u.id, u.name, u.email, u.guardian_name, u.nationality, u.age, u.created_at,
                sp.payment_status, sp.sessions_remaining, sp.subject, sp.package_id,
                tp.package_name,
                CASE WHEN sp.payment_status = 'paid' AND sp.sessions_remaining = 0 THEN TRUE ELSE FALSE END AS enrolled
            FROM users u
            LEFT JOIN student_packages sp
                ON u.id = sp.student_id
                AND sp.purchased_at = (
                    SELECT MAX(purchased_at) FROM student_packages
                    WHERE student_id = u.id AND company_id = ?
                )
            LEFT JOIN tutorial_packages tp ON sp.package_id = tp.id
            WHERE u.role = 'student' AND u.company_id = ?
            ORDER BY u.id
        `, [companyId, companyId]);
        res.json(rows);
    } catch (err) {
        console.error("Error fetching students:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// Pending student packages in this company
router.get("/student-packages/pending", authenticateToken, requireRole('company_admin'), async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const [rows] = await pool.query(`
            SELECT sp.*, u.name AS student_name
            FROM student_packages sp
            JOIN users u ON sp.student_id = u.id
            WHERE sp.payment_status = 'unpaid' AND sp.sessions_remaining > 0 AND sp.company_id = ?
            ORDER BY sp.purchased_at DESC
        `, [companyId]);
        res.json(rows);
    } catch (err) {
        console.error("Error fetching pending packages:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// Paid student packages in this company
router.get("/student-packages/paid", authenticateToken, requireRole('company_admin'), async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const [rows] = await pool.query(`
            SELECT sp.*, u.name AS student_name
            FROM student_packages sp
            JOIN users u ON sp.student_id = u.id
            WHERE sp.payment_status = 'paid' AND sp.sessions_remaining > 0 AND sp.company_id = ?
            ORDER BY sp.purchased_at DESC
        `, [companyId]);
        res.json(rows);
    } catch (err) {
        console.error("Error fetching paid packages:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

module.exports = router;
