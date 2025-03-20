const express = require("express");
const pool = require("../db");

const router = express.Router();

// Get student bookings
// router.get("/api/bookings", async (req, res) => {
//     try {
//         const { student_package_id } = req.query;
//         const result = await pool.query("SELECT * FROM bookings WHERE student_package_id = $1", [student_package_id]);
//         res.json(result.rows);
//     } catch (err) {
//         res.status(500).json({ message: "Server error", error: err.message });
//     }
// });
router.get("/api/bookings", async (req, res) => {
  try {
      const { student_package_id } = req.query;
      console.log("Received student_package_id:", student_package_id); // Debugging

      const result = await pool.query(
          "SELECT * FROM bookings WHERE student_package_id = $1",
          [student_package_id]
      );

      console.log("Database result:", result.rows); // Debugging
      res.json(result.rows);
  } catch (err) {
      res.status(500).json({ message: "Server error", error: err.message });
  }
});


// Book a session
router.post("/api/bookings", async (req, res) => {
    try {
        const { student_package_id, appointment_date, status, rescheduled_by_admin } = req.body;

        if (!student_package_id || !appointment_date || status === undefined || rescheduled_by_admin === undefined) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const result = await pool.query(
            `INSERT INTO bookings (student_package_id, appointment_date, status, rescheduled_by_admin, created_at) 
             VALUES ($1, $2, $3, $4, NOW()) RETURNING id`,
            [student_package_id, appointment_date, status, rescheduled_by_admin]
        );

        res.json({ message: "Booking request submitted", booking_id: result.rows[0].id });
    } catch (err) {
        console.error("Booking Error:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

router.get("/api/student-bookings", async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT 
          b.id,
          u.student_name,
          tp.package_name,
          b.appointment_date,
          b.status,
          b.rescheduled_by_admin,
          b.student_package_id, 
          b.created_at
        FROM bookings b
        JOIN student_packages sp ON b.student_package_id = sp.id
        JOIN users u ON sp.student_id = u.id
        JOIN tutorial_packages tp ON sp.package_id = tp.id
        WHERE b.appointment_date >= NOW()   
        ORDER BY b.appointment_date ASC
      `);
      //  Check if result.rows is empty before accessing result.rows[0]
      if (result.rows.length === 0) {
        console.log("No bookings found.");
        return res.json([]); // Return an empty array
    }

    console.log("Returning student package ID:", result.rows[0].student_package_id);
    res.json(result.rows);
    } catch (err) {
      console.error("Error fetching bookings:", err);
      res.status(500).json({ message: "Server error", error: err.message });
    }
  });


module.exports = router;
