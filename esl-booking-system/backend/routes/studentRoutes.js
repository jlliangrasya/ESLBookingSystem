const express = require('express');
const router = express.Router();
const pool = require('../db'); // Ensure this is correctly importing your database connection
const authenticateToken = require('../middleware/authMiddleware.js'); // Ensure JWT auth middleware is included

// Fetch student dashboard data
router.get('/dashboard', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;  // Extract student ID from JWT
        console.log("Fetching student data for user ID:", userId); // Debugging

        // Fetch student details
        const studentQuery = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        
        if (studentQuery.rows.length === 0) {
            console.log("No student found for ID:", userId);
            return res.status(404).json({ message: "Student not found" });
        }

        const student = studentQuery.rows[0];

        // Fetch student's package details
        const packageQuery = await pool.query(
            `SELECT tp.id, tp.package_name, sp.sessions_remaining AS sessions_remaining, tp.price
             FROM student_packages sp
             JOIN tutorial_packages tp ON sp.package_id = tp.id
             WHERE sp.student_id = $1`, [userId]);
;

        const packageDetails = packageQuery.rows.length > 0 ? packageQuery.rows[0] : null;
        console.log("Package Details ID:", packageDetails ? packageDetails.id : "No package found")

        let bookings = [];

        if (packageDetails) {
            // Fetch student's package ID
            const studentPackageQuery = await pool.query(
                `SELECT id FROM student_packages WHERE student_id = $1`, 
                [userId]
            );

      
      const studentPackage = studentPackageQuery.rows[0]; 
      
      // if (!studentPackage) {
      //     return res.status(404).json({ message: "No package found for this student" });
      // }
      
      if (studentPackage) {
      // Now fetch bookings using this student_package_id
        const bookingsQuery = await pool.query(
            `SELECT * FROM bookings WHERE student_package_id = $1`, 
            [studentPackage.id]
        );
          
                bookings = bookingsQuery.rows.map(booking => {
                  const appointmentDate = new Date(booking.appointment_date); // Auto-converts UTC to local
              
                  return {
                      id: booking.id,
                      appointment_date: appointmentDate.toISOString().split('T')[0], // Extract YYYY-MM-DD
                      timeslot: appointmentDate.toLocaleTimeString('en-US', { 
                          hour: '2-digit', 
                          minute: '2-digit', 
                          hour12: true 
                      }),
                      status: booking.status,
                  };
              });
      
              }
            }
            
        console.log("Student Data:", student);
        console.log("Package Details:", packageDetails);
        console.log("Bookings:", bookings);
        console.log("User ID:", userId);
        console.log("Student Package ID:", packageDetails ? packageDetails.id : "No package found");
        res.json({ student, package: packageDetails, bookings });
    } catch (error) {
        console.error("Error fetching student dashboard:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

// Fetch all students and check if they are enrolled
router.get("/students", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT ON (u.id) 
             u.id,
             u.student_name,
             u.email,
             u.guardian_name,
             u.nationality,
             u.age,
             u.created_at,
             u.is_admin,
             sp.payment_status,
             sp.sessions_remaining,
             sp.subject,
             sp.package_id,
             tp.package_name,
             CASE 
               WHEN sp.payment_status = 'paid' AND sp.sessions_remaining = 0 THEN true 
               ELSE false 
             END AS enrolled
      FROM users u
      LEFT JOIN student_packages sp ON u.id = sp.student_id
      LEFT JOIN tutorial_packages tp ON sp.package_id = tp.id 
      WHERE u.is_admin = false  -- Exclude admin accounts
      ORDER BY u.id, sp.purchased_at DESC;
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching students:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.get("/student-packages/pending", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM student_packages
      WHERE payment_status = 'unpaid'
        AND sessions_remaining > 0
      ORDER BY purchased_at DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching pending student packages:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.get("/student-packages/paid", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM student_packages
      WHERE payment_status = 'paid'
        AND sessions_remaining > 0
      ORDER BY purchased_at DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching pending student packages:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});
  

module.exports = router;
