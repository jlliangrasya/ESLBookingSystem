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

  router.get("/api/completed-bookings", async (req, res) => {
    try {
      // Automatically update past "pending" bookings to "Done"
      await pool.query(`
        UPDATE bookings 
        SET status = 'done' 
        WHERE status = 'pending' AND appointment_date < NOW()
        RETURNING *;
      `);
  
      // Retrieve all bookings that are marked as "Done"
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
        WHERE b.status = 'Done'
        ORDER BY b.appointment_date DESC
      `);
  
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching completed bookings:", err);
      res.status(500).json({ message: "Server error", error: err.message });
    }
  });
  

  router.get("/api/student-package/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query(
        "SELECT subject FROM student_packages WHERE id = $1",
        [id]
      );
  
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Student package not found" });
      }
  
      res.json(result.rows[0]);
    } catch (err) {
      console.error("Error fetching subject:", err);
      res.status(500).json({ message: "Server error", error: err.message });
    }
  });

  router.delete("/api/bookings/:id", async (req, res) => {
    try {
      const { id } = req.params;
  
      const deleteResult = await pool.query(
        "DELETE FROM bookings WHERE id = $1 RETURNING id",
        [id]
      );
  
      if (deleteResult.rowCount === 0) {
        return res.status(404).json({ message: "Booking not found" });
      }
  
      res.json({ message: "Booking canceled successfully" });
    } catch (err) {
      console.error("Error deleting booking:", err);
      res.status(500).json({ message: "Server error", error: err.message });
    }
  });
  

  router.post("/api/bookings/done/:id", async (req, res) => {
    const { id } = req.params; // Booking ID
    const { student_package_id } = req.body; // Package ID of the student
  
    try {
      // Reduce sessions_remaining by 1
      await pool.query(
        `UPDATE student_packages 
         SET sessions_remaining = sessions_remaining - 1
         WHERE id = $1 AND sessions_remaining > 0`,
        [student_package_id]
      );
  
      // Mark the booking as "completed"
      await pool.query(
        `UPDATE bookings SET status = 'completed' WHERE id = $1`,
        [id]
      );
  
      res.json({ message: "Class marked as done!" });
    } catch (err) {
      console.error("Error marking class as done:", err);
      res.status(500).json({ message: "Server error", error: err.message });
    }
  });

  router.post("/api/bookings/cancel/:id", async (req, res) => {
    const { id } = req.params; // Booking ID
  
    try {
      // Just mark the booking as "cancelled", no session deduction
      await pool.query(
        `UPDATE bookings SET status = 'cancelled' WHERE id = $1`,
        [id]
      );
  
      res.json({ message: "Class cancelled!" });
    } catch (err) {
      console.error("Error cancelling class:", err);
      res.status(500).json({ message: "Server error", error: err.message });
    }
  });
  

module.exports = router;
