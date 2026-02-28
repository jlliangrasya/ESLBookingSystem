const express = require("express");
const pool = require("../db");
const jwt = require("jsonwebtoken");
const authenticateToken = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");

const router = express.Router();

// Get tutorial packages for this company
router.get("/packages", authenticateToken, async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const [rows] = await pool.query(
            "SELECT * FROM tutorial_packages WHERE company_id = ?",
            [companyId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// Create a tutorial package (company_admin only)
router.post("/packages", authenticateToken, requireRole('company_admin'), async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const { package_name, session_limit, price } = req.body;

        if (!package_name || !session_limit || !price) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const [result] = await pool.query(
            "INSERT INTO tutorial_packages (company_id, package_name, session_limit, price) VALUES (?, ?, ?, ?)",
            [companyId, package_name, session_limit, price]
        );

        res.json({ message: "Package created", id: result.insertId });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// Student avails a package
router.post("/avail", authenticateToken, requireRole('student'), async (req, res) => {
    try {
        const { package_id, subject } = req.body;
        const studentId = req.user.id;
        const companyId = req.user.company_id;

        if (!package_id || !subject) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const validSubjects = ["ENGLISH", "MATH", "SCIENCE", "CODING"];
        if (!validSubjects.includes(subject.toUpperCase())) {
            return res.status(400).json({ message: "Invalid subject selected" });
        }

        // Verify the package belongs to this company
        const [pkgRows] = await pool.query(
            "SELECT id FROM tutorial_packages WHERE id = ? AND company_id = ?",
            [package_id, companyId]
        );
        if (pkgRows.length === 0) {
            return res.status(400).json({ message: "Package not found" });
        }

        const [result] = await pool.query(
            `INSERT INTO student_packages (company_id, student_id, package_id, subject, sessions_remaining, payment_status, purchased_at)
             VALUES (?, ?, ?, ?, (SELECT session_limit FROM tutorial_packages WHERE id = ?), 'unpaid', NOW())`,
            [companyId, studentId, package_id, subject.toUpperCase(), package_id]
        );

        res.json({ message: "Package availed successfully", student_package_id: result.insertId });
    } catch (err) {
        console.error("Server Error:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// Get student's active package
router.get("/avail", authenticateToken, requireRole('student'), async (req, res) => {
    try {
        const studentId = req.user.id;
        const companyId = req.user.company_id;

        const [rows] = await pool.query(
            `SELECT id AS student_package_id FROM student_packages
             WHERE student_id = ? AND company_id = ?
             ORDER BY purchased_at DESC LIMIT 1`,
            [studentId, companyId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: "No active package found" });
        }

        res.json(rows[0]);
    } catch (err) {
        console.error("Error fetching student package:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// Confirm payment (company_admin only)
router.post("/package/confirm/:id", authenticateToken, requireRole('company_admin'), async (req, res) => {
    const { id } = req.params;
    const companyId = req.user.company_id;
    try {
        const [result] = await pool.query(
            "UPDATE student_packages SET payment_status = 'paid' WHERE id = ? AND company_id = ?",
            [id, companyId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Enrollee not found" });
        }
        const [rows] = await pool.query("SELECT * FROM student_packages WHERE id = ?", [id]);
        res.json({ message: "Enrollee confirmed successfully", enrollee: rows[0] });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// Reject enrollment (company_admin only)
router.post("/package/reject/:id", authenticateToken, requireRole('company_admin'), async (req, res) => {
    const { id } = req.params;
    const companyId = req.user.company_id;
    try {
        const [result] = await pool.query(
            "UPDATE student_packages SET payment_status = 'rejected' WHERE id = ? AND company_id = ?",
            [id, companyId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Enrollee not found" });
        }
        const [rows] = await pool.query("SELECT * FROM student_packages WHERE id = ?", [id]);
        res.json({ message: "Enrollee rejected successfully", enrollee: rows[0] });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

module.exports = router;
