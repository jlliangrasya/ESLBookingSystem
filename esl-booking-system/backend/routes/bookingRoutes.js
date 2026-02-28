const express = require("express");
const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");

const router = express.Router();

// Get bookings by student_package_id
router.get("/api/bookings", authenticateToken, async (req, res) => {
    try {
        const { student_package_id } = req.query;
        const companyId = req.user.company_id;

        const [rows] = await pool.query(
            "SELECT * FROM bookings WHERE student_package_id = ? AND company_id = ?",
            [student_package_id, companyId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// Create a booking
router.post("/api/bookings", authenticateToken, requireRole('student'), async (req, res) => {
    try {
        const { student_package_id, appointment_date, status, rescheduled_by_admin } = req.body;
        const companyId = req.user.company_id;

        if (!student_package_id || !appointment_date || status === undefined || rescheduled_by_admin === undefined) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        // Get teacher_id from the student package if assigned
        const [spRows] = await pool.query(
            "SELECT teacher_id FROM student_packages WHERE id = ? AND company_id = ?",
            [student_package_id, companyId]
        );
        const teacherId = spRows.length > 0 ? spRows[0].teacher_id : null;

        const [result] = await pool.query(
            `INSERT INTO bookings (company_id, student_package_id, teacher_id, appointment_date, status, rescheduled_by_admin, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [companyId, student_package_id, teacherId, appointment_date, status, rescheduled_by_admin]
        );

        res.json({ message: "Booking request submitted", booking_id: result.insertId });
    } catch (err) {
        console.error("Booking Error:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// Upcoming bookings (company_admin view)
router.get("/api/student-bookings", authenticateToken, requireRole('company_admin'), async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const [rows] = await pool.query(`
            SELECT
                b.id, b.appointment_date, b.status, b.rescheduled_by_admin,
                b.student_package_id, b.created_at,
                u.name AS student_name,
                tp.package_name,
                t.name AS teacher_name
            FROM bookings b
            JOIN student_packages sp ON b.student_package_id = sp.id
            JOIN users u ON sp.student_id = u.id
            JOIN tutorial_packages tp ON sp.package_id = tp.id
            LEFT JOIN users t ON b.teacher_id = t.id
            WHERE b.appointment_date >= NOW() AND b.company_id = ?
            ORDER BY b.appointment_date ASC
        `, [companyId]);

        if (rows.length === 0) return res.json([]);
        res.json(rows);
    } catch (err) {
        console.error("Error fetching bookings:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// Completed bookings (auto-mark past pending as done)
router.get("/api/completed-bookings", authenticateToken, requireRole('company_admin'), async (req, res) => {
    try {
        const companyId = req.user.company_id;

        await pool.query(`
            UPDATE bookings SET status = 'done'
            WHERE status = 'pending' AND appointment_date < NOW() AND company_id = ?
        `, [companyId]);

        const [rows] = await pool.query(`
            SELECT
                b.id, b.appointment_date, b.status, b.rescheduled_by_admin,
                b.student_package_id, b.created_at,
                u.name AS student_name,
                tp.package_name,
                t.name AS teacher_name
            FROM bookings b
            JOIN student_packages sp ON b.student_package_id = sp.id
            JOIN users u ON sp.student_id = u.id
            JOIN tutorial_packages tp ON sp.package_id = tp.id
            LEFT JOIN users t ON b.teacher_id = t.id
            WHERE b.status = 'done' AND b.company_id = ?
            ORDER BY b.appointment_date DESC
        `, [companyId]);

        res.json(rows);
    } catch (err) {
        console.error("Error fetching completed bookings:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// Get subject for a student package
router.get("/api/student-package/:id", authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.user.company_id;
        const [rows] = await pool.query(
            "SELECT subject FROM student_packages WHERE id = ? AND company_id = ?",
            [id, companyId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ message: "Student package not found" });
        }
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// Cancel a booking
router.delete("/api/bookings/:id", authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.user.company_id;

        const [result] = await pool.query(
            "DELETE FROM bookings WHERE id = ? AND company_id = ?",
            [id, companyId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Booking not found" });
        }
        res.json({ message: "Booking canceled successfully" });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// Mark class as done + deduct session
router.post("/api/bookings/done/:id", authenticateToken, requireRole('company_admin'), async (req, res) => {
    const { id } = req.params;
    const { student_package_id } = req.body;
    const companyId = req.user.company_id;

    try {
        await pool.query(
            `UPDATE student_packages SET sessions_remaining = sessions_remaining - 1
             WHERE id = ? AND company_id = ? AND sessions_remaining > 0`,
            [student_package_id, companyId]
        );
        await pool.query(
            "UPDATE bookings SET status = 'confirmed' WHERE id = ? AND company_id = ?",
            [id, companyId]
        );
        res.json({ message: "Class marked as done!" });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// Cancel a class (no session deduction)
router.post("/api/bookings/cancel/:id", authenticateToken, requireRole('company_admin'), async (req, res) => {
    const { id } = req.params;
    const companyId = req.user.company_id;

    try {
        await pool.query(
            "UPDATE bookings SET status = 'cancelled' WHERE id = ? AND company_id = ?",
            [id, companyId]
        );
        res.json({ message: "Class cancelled!" });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

module.exports = router;
