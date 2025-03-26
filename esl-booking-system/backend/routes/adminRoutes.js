const express = require("express");
const router = express.Router();
const pool = require("../db"); // Your database connection
const verifyToken = require("../middleware/authMiddleware");
const authenticateToken = require("../middleware/authMiddleware"); // Import middleware

// API: Fetch Closed Slots
router.get("/closed-slots", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM closed_slots");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server Error" });
  }
});

// API: Update Closed Slots (Open/Close Slots)
router.post("/update-slots", async (req, res) => {
  const { slots, action } = req.body; // `slots` = [{ date: "2025-03-19", time: "09:00 AM" }]

  if (!slots || !Array.isArray(slots)) {
    return res.status(400).json({ error: "Invalid slot data" });
  }

  try {
    if (action === "close") {
      // Insert closed slots into the database
      const insertQuery =
        "INSERT INTO closed_slots (date, time) VALUES ($1, $2) ON CONFLICT DO NOTHING";
      for (const slot of slots) {
        await pool.query(insertQuery, [slot.date, slot.time]);
      }
      return res.json({ message: "Slots closed successfully" });
    } else if (action === "open") {
      // Delete closed slots to reopen them
      const deleteQuery = "DELETE FROM closed_slots WHERE date = $1 AND time = $2";
      for (const slot of slots) {
        await pool.query(deleteQuery, [slot.date, slot.time]);
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
router.get("/profile", verifyToken, async (req, res) => {
  try {
    const adminId = req.user.id;
    const result = await pool.query("SELECT student_name, email FROM users WHERE id = $1", [adminId]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching profile:", err);
    res.status(500).json({ message: "Server error" });
  }
});

//  Update admin profile
router.put("/profile", authenticateToken, async (req, res) => {
  try {
    console.log("Received Token Data:", req.user); // ✅ Debugging log

    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "Unauthorized: Admin ID is missing" });
    }

    const { student_name, email, password } = req.body;
    const adminId = req.user.id; // ✅ Use req.user.id

    let query;
    let values;
    if (password) {
      query = `UPDATE users SET student_name = $1, email = $2, password = crypt($3, gen_salt('bf')) WHERE id = $4 RETURNING *`;
      values = [student_name, email, password, adminId];
    } else {
      query = `UPDATE users SET student_name = $1, email = $2 WHERE id = $3 RETURNING *`;
      values = [student_name, email, adminId];
    }

    const result = await pool.query(query, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Admin not found" });
    }

    res.json({ message: "Profile updated successfully", admin: result.rows[0] });
  } catch (error) {
    console.error("Error updating admin profile:", error);
    res.status(500).json({ message: "Server error" });
  }
});


module.exports = router;
