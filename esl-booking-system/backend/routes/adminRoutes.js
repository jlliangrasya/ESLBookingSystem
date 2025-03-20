const express = require("express");
const router = express.Router();
const pool = require("../db"); // Your database connection

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

module.exports = router;
