const express = require("express");
const pool = require("../db");

const router = express.Router();
const jwt = require("jsonwebtoken");

// Get all available packages
router.get("/packages", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM tutorial_packages");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// Avail a package
router.post("/avail", async (req, res) => {
    try {
        const { student_id, package_id, subject } = req.body;

        console.log("Received data:", { student_id, package_id, subject }); // Debugging

        if (!student_id || !package_id || !subject) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        // Validate subject
        const validSubjects = ["ENGLISH", "MATH", "SCIENCE", "CODING"];
        if (!validSubjects.includes(subject.toUpperCase())) {
            return res.status(400).json({ message: "Invalid subject selected" });
        }

        // Insert into student_packages
        const result = await pool.query(
            `INSERT INTO student_packages (student_id, package_id, subject, sessions_remaining, payment_status, purchased_at)
             VALUES ($1, $2, $3, (SELECT session_limit FROM tutorial_packages WHERE id = $2), 'unpaid', NOW())
             RETURNING id`,
            [student_id, package_id, subject.toUpperCase()]
        );

        console.log("Inserted Package ID:", result.rows[0].id); // Debugging

        res.json({ message: "Package availed successfully", student_package_id: result.rows[0].id });
    } catch (err) {
        console.error("Server Error:", err); // Log full error
        res.status(500).json({ message: "Server error", error: err.message });
    }
  
});

router.get("/avail", async (req, res) => {
    try {
      console.log("Headers received:", req.headers);  // Debugging
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
      }
  
      console.log("Received token:", token);

      // Extract student ID from the token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log("Decoded token:", decoded);
      const student_id = decoded.id;
      console.log("Extracted student_id:", student_id);
  
      const result = await pool.query(
        `SELECT id AS student_package_id 
         FROM student_packages 
         WHERE student_id = $1 
         ORDER BY purchased_at DESC 
         LIMIT 1`,
        [student_id]
      );
  
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "No active package found" });
      }
  
      res.json(result.rows[0]);
    } catch (err) {
      console.error("Error fetching student package:", err);
      res.status(500).json({ message: "Server error", error: err.message });
    }
  });
  


module.exports = router;
