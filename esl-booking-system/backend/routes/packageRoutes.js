const express = require("express");
const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");

const router = express.Router();

// Get tutorial packages for this company
// Students: active only; company_admin: all
router.get("/packages", authenticateToken, async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const role = req.user.role;
        let rows;
        if (role === 'company_admin') {
            [rows] = await pool.query(
                "SELECT * FROM tutorial_packages WHERE company_id = ? ORDER BY is_active DESC, id ASC",
                [companyId]
            );
        } else {
            [rows] = await pool.query(
                "SELECT * FROM tutorial_packages WHERE company_id = ? AND is_active = true ORDER BY id ASC",
                [companyId]
            );
        }
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

// Create a tutorial package (company_admin only)
router.post("/packages", authenticateToken, requireRole('company_admin'), async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const { package_name, session_limit, price, subject, duration_minutes, description, currency } = req.body;

        if (!package_name || !session_limit || !price) {
            return res.status(400).json({ message: "Missing required fields: package_name, session_limit, price" });
        }

        const [result] = await pool.query(
            `INSERT INTO tutorial_packages (company_id, package_name, session_limit, price, subject, duration_minutes, description, is_active, currency)
             VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, ?)`,
            [companyId, package_name, session_limit, price,
             subject || null, duration_minutes || 60, description || null, currency || 'PHP']
        );

        res.json({ message: "Package created", id: result.insertId });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

// Update a tutorial package (company_admin only)
router.put("/packages/:id", authenticateToken, requireRole('company_admin'), async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const { id } = req.params;
        const { package_name, session_limit, price, subject, duration_minutes, description, is_active, currency } = req.body;

        const [result] = await pool.query(
            `UPDATE tutorial_packages
             SET package_name = ?, session_limit = ?, price = ?, subject = ?, duration_minutes = ?, description = ?, is_active = ?, currency = ?
             WHERE id = ? AND company_id = ?`,
            [package_name, session_limit, price,
             subject || null, duration_minutes || 60, description || null,
             is_active !== undefined ? is_active : true,
             currency || 'PHP', id, companyId]
        );

        if (result.affectedRows === 0) return res.status(404).json({ message: "Package not found" });
        res.json({ message: "Package updated" });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

// Soft-delete (deactivate) a tutorial package (company_admin only)
router.delete("/packages/:id", authenticateToken, requireRole('company_admin'), async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const { id } = req.params;

        const [result] = await pool.query(
            "UPDATE tutorial_packages SET is_active = false WHERE id = ? AND company_id = ?",
            [id, companyId]
        );

        if (result.affectedRows === 0) return res.status(404).json({ message: "Package not found" });
        res.json({ message: "Package deactivated" });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

// Student avails a package
router.post("/avail", authenticateToken, requireRole('student'), async (req, res) => {
    try {
        const { package_id, receipt_image, transaction_order_number, teacher_id } = req.body;
        const studentId = req.user.id;
        const companyId = req.user.company_id;

        if (!package_id) {
            return res.status(400).json({ message: "package_id is required" });
        }

        // Verify the package belongs to this company and is active
        const [[pkg]] = await pool.query(
            "SELECT id, subject, session_limit FROM tutorial_packages WHERE id = ? AND company_id = ? AND is_active = true",
            [package_id, companyId]
        );
        if (!pkg) {
            return res.status(400).json({ message: "Package not found or inactive" });
        }

        // If teacher_id provided, verify teacher belongs to this company
        if (teacher_id) {
            const [[teacher]] = await pool.query(
                "SELECT id FROM users WHERE id = ? AND company_id = ? AND role = 'teacher'",
                [teacher_id, companyId]
            );
            if (!teacher) {
                return res.status(400).json({ message: "Teacher not found" });
            }
        }

        const [result] = await pool.query(
            `INSERT INTO student_packages
             (company_id, student_id, package_id, subject, sessions_remaining, payment_status, receipt_image, teacher_id, purchased_at)
             VALUES (?, ?, ?, ?, ?, 'unpaid', ?, ?, NOW())`,
            [companyId, studentId, package_id,
             pkg.subject || '', pkg.session_limit,
             receipt_image || transaction_order_number || null,
             teacher_id || null]
        );

        res.json({ message: "Package availed successfully", student_package_id: result.insertId });
    } catch (err) {
        console.error("Server Error:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// Get student's active (paid) package
router.get("/avail", authenticateToken, requireRole('student'), async (req, res) => {
    try {
        const studentId = req.user.id;
        const companyId = req.user.company_id;

        const [rows] = await pool.query(
            `SELECT sp.id AS student_package_id, sp.teacher_id, tp.duration_minutes
             FROM student_packages sp
             JOIN tutorial_packages tp ON sp.package_id = tp.id
             WHERE sp.student_id = ? AND sp.company_id = ? AND sp.payment_status = 'paid' AND sp.sessions_remaining > 0
             ORDER BY sp.purchased_at DESC LIMIT 1`,
            [studentId, companyId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: "No active package found" });
        }

        res.json(rows[0]);
    } catch (err) {
        console.error("Error fetching student package:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// Confirm payment (company_admin only)
// If the student already has a paid package, append sessions to it instead of creating a second active package.
// Wrapped in transaction with FOR UPDATE to prevent race conditions (double-confirm).
router.post("/package/confirm/:id", authenticateToken, requireRole('company_admin'), async (req, res) => {
    const { id } = req.params;
    const companyId = req.user.company_id;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Lock the package row to prevent concurrent confirm
        const [[newPkg]] = await connection.query(
            `SELECT sp.id, sp.student_id, sp.sessions_remaining, tp.session_limit
             FROM student_packages sp
             JOIN tutorial_packages tp ON sp.package_id = tp.id
             WHERE sp.id = ? AND sp.company_id = ? AND sp.payment_status != 'paid'
             FOR UPDATE`,
            [id, companyId]
        );
        if (!newPkg) {
            await connection.rollback();
            return res.status(404).json({ message: "Enrollee not found or already confirmed" });
        }

        // Check if the student already has an existing paid package (lock it too)
        // Prefer the one with sessions remaining (the active one bookings are made against)
        const [[existingPkg]] = await connection.query(
            `SELECT id FROM student_packages
             WHERE student_id = ? AND company_id = ? AND payment_status = 'paid' AND id != ?
             ORDER BY CASE WHEN sessions_remaining > 0 THEN 0 ELSE 1 END, purchased_at DESC
             LIMIT 1
             FOR UPDATE`,
            [newPkg.student_id, companyId, id]
        );

        if (existingPkg) {
            // Append sessions to existing paid package
            await connection.query(
                `UPDATE student_packages SET sessions_remaining = sessions_remaining + ? WHERE id = ? AND company_id = ?`,
                [newPkg.sessions_remaining, existingPkg.id, companyId]
            );
            // Mark new package as paid with 0 sessions (audit trail)
            await connection.query(
                `UPDATE student_packages SET payment_status = 'paid', sessions_remaining = 0 WHERE id = ? AND company_id = ?`,
                [id, companyId]
            );
        } else {
            // No existing paid package — confirm normally
            await connection.query(
                "UPDATE student_packages SET payment_status = 'paid' WHERE id = ? AND company_id = ?",
                [id, companyId]
            );
        }

        await connection.commit();

        const [rows] = await pool.query("SELECT * FROM student_packages WHERE id = ? AND company_id = ?", [id, companyId]);
        res.json({ message: "Enrollee confirmed successfully", enrollee: rows[0] });
    } catch (err) {
        await connection.rollback();
        console.error("Error confirming package:", err);
        res.status(500).json({ message: "Server error" });
    } finally {
        connection.release();
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

        // Cancel any active bookings associated with this package and refund sessions
        const [[{ activeCnt }]] = await pool.query(
            "SELECT COUNT(*) AS activeCnt FROM bookings WHERE student_package_id = ? AND status NOT IN ('done', 'cancelled')",
            [id]
        );
        if (activeCnt > 0) {
            await pool.query(
                "UPDATE bookings SET status = 'cancelled' WHERE student_package_id = ? AND status NOT IN ('done', 'cancelled')",
                [id]
            );
            // Refund sessions for the cancelled bookings
            await pool.query(
                `UPDATE student_packages SET sessions_remaining = sessions_remaining + ? WHERE id = ? AND company_id = ?`,
                [activeCnt, id, companyId]
            );
        }

        const [rows] = await pool.query("SELECT * FROM student_packages WHERE id = ?", [id]);
        res.json({ message: "Enrollee rejected successfully", enrollee: rows[0] });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;
