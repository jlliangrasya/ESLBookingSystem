const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");

// Fetch closed slots for this company
router.get("/closed-slots", authenticateToken, requireRole('company_admin', 'teacher', 'student'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const [rows] = await pool.query(
      "SELECT * FROM closed_slots WHERE company_id = ?",
      [companyId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server Error" });
  }
});

// Open/close slots (company_admin only)
router.post("/update-slots", authenticateToken, requireRole('company_admin'), async (req, res) => {
  const { slots, action } = req.body;
  const companyId = req.user.company_id;

  if (!slots || !Array.isArray(slots)) {
    return res.status(400).json({ error: "Invalid slot data" });
  }

  try {
    if (action === "close") {
      for (const slot of slots) {
        await pool.query(
          "INSERT IGNORE INTO closed_slots (company_id, date, time) VALUES (?, ?, ?)",
          [companyId, slot.date, slot.time]
        );
      }
      return res.json({ message: "Slots closed successfully" });
    } else if (action === "open") {
      for (const slot of slots) {
        await pool.query(
          "DELETE FROM closed_slots WHERE company_id = ? AND date = ? AND time = ?",
          [companyId, slot.date, slot.time]
        );
      }
      return res.json({ message: "Slots opened successfully" });
    } else {
      return res.status(400).json({ error: "Invalid action" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server Error" });
  }
});

// Get admin profile
router.get("/profile", authenticateToken, requireRole('company_admin'), async (req, res) => {
  try {
    const adminId = req.user.id;
    const [rows] = await pool.query(
      "SELECT name, email FROM users WHERE id = ?",
      [adminId]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error("Error fetching profile:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Update admin profile
router.put("/profile", authenticateToken, requireRole('company_admin'), async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const adminId = req.user.id;

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await pool.query(
        "UPDATE users SET name = ?, email = ?, password = ? WHERE id = ?",
        [name, email, hashedPassword, adminId]
      );
    } else {
      await pool.query(
        "UPDATE users SET name = ?, email = ? WHERE id = ?",
        [name, email, adminId]
      );
    }

    const [updated] = await pool.query(
      "SELECT id, name, email FROM users WHERE id = ?",
      [adminId]
    );

    if (updated.length === 0) {
      return res.status(404).json({ message: "Admin not found" });
    }

    res.json({ message: "Profile updated successfully", admin: updated[0] });
  } catch (error) {
    console.error("Error updating admin profile:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// List teachers in this company
router.get("/teachers", authenticateToken, requireRole('company_admin'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const [rows] = await pool.query(
      "SELECT id, name, email, created_at FROM users WHERE company_id = ? AND role = 'teacher' ORDER BY name ASC",
      [companyId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;
