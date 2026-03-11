const express = require("express");
const router = express.Router();
const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");
const notify = require("../utils/notify");
const { logAction } = require("../utils/audit");

// Helper: check if admin user has a specific permission or is_owner
async function canDo(userId, permission) {
    const [[user]] = await pool.query('SELECT is_owner FROM users WHERE id = ?', [userId]);
    if (user?.is_owner) return true;
    const [[perm]] = await pool.query(`SELECT ${permission} FROM admin_permissions WHERE user_id = ?`, [userId]);
    return !!perm?.[permission];
}

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
      await Promise.all(slots.map(slot =>
        pool.query(
          "INSERT IGNORE INTO closed_slots (company_id, date, time) VALUES (?, ?, ?)",
          [companyId, slot.date, slot.time]
        )
      ));
      return res.json({ message: "Slots closed successfully" });
    } else if (action === "open") {
      await Promise.all(slots.map(slot =>
        pool.query(
          "DELETE FROM closed_slots WHERE company_id = ? AND date = ? AND time = ?",
          [companyId, slot.date, slot.time]
        )
      ));
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
      await pool.query(
        "UPDATE users SET name = ?, email = ?, password = ? WHERE id = ?",
        [name, email, password, adminId]
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

// List teachers in this company (with upcoming class count + weekly/monthly stats) — active only
// Optional query params: ?month=3&year=2026 to get class count for a specific month
router.get("/teachers", authenticateToken, requireRole('company_admin'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const [rows] = await pool.query(`
      SELECT u.id, u.name, u.email, u.created_at,
             COUNT(DISTINCT CASE WHEN b.appointment_date >= NOW() AND b.status = 'pending' THEN b.id END) AS upcoming_classes,
             COUNT(DISTINCT CASE WHEN b.status IN ('confirmed','done')
                                   AND YEARWEEK(b.appointment_date, 1) = YEARWEEK(CURDATE(), 1)
                              THEN b.id END) AS classes_this_week,
             COUNT(DISTINCT CASE WHEN b.status IN ('confirmed','done')
                                   AND YEAR(b.appointment_date) = ?
                                   AND MONTH(b.appointment_date) = ?
                              THEN b.id END) AS classes_this_month
      FROM users u
      LEFT JOIN bookings b ON b.teacher_id = u.id AND b.company_id = u.company_id
      WHERE u.company_id = ? AND u.role = 'teacher' AND u.is_active = TRUE
      GROUP BY u.id
      ORDER BY u.name ASC
    `, [year, month, companyId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Add a teacher directly (permission: can_add_teacher)
router.post("/teachers", authenticateToken, requireRole('company_admin'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const adminId = req.user.id;
    if (!await canDo(adminId, 'can_add_teacher')) {
      return res.status(403).json({ message: 'You do not have permission to add teachers' });
    }
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'name, email, and password are required' });

    // Enforce plan teacher limit (active only)
    const [[planLimit]] = await pool.query(
      `SELECT sp.max_teachers FROM companies c
       JOIN subscription_plans sp ON c.subscription_plan_id = sp.id
       WHERE c.id = ?`, [companyId]
    );
    if (planLimit) {
      const [[{ cnt }]] = await pool.query(
        "SELECT COUNT(*) AS cnt FROM users WHERE company_id = ? AND role = 'teacher' AND is_active = TRUE",
        [companyId]
      );
      if (cnt >= planLimit.max_teachers) {
        return res.status(400).json({ message: `Teacher limit reached (${planLimit.max_teachers} max on your plan)` });
      }
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) return res.status(400).json({ message: 'Email already registered' });

    const [result] = await pool.query(
      "INSERT INTO users (company_id, role, name, email, password) VALUES (?, 'teacher', ?, ?, ?)",
      [companyId, name, email, password]
    );
    await logAction(companyId, adminId, 'teacher_added', 'user', result.insertId, { name, email });
    res.status(201).json({ message: 'Teacher added successfully', teacher_id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get a single teacher profile (company_admin)
router.get("/teachers/:id", authenticateToken, requireRole('company_admin'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { id } = req.params;
    const [[teacher]] = await pool.query(
      "SELECT id, name, email, created_at FROM users WHERE id = ? AND company_id = ? AND role = 'teacher'",
      [id, companyId]
    );
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });

    const [schedule] = await pool.query(`
      SELECT b.id, b.appointment_date, b.status, b.class_mode, b.meeting_link,
             u.name AS student_name, tp.package_name, sp.subject
      FROM bookings b
      JOIN student_packages sp ON b.student_package_id = sp.id
      JOIN users u ON sp.student_id = u.id
      JOIN tutorial_packages tp ON sp.package_id = tp.id
      WHERE b.teacher_id = ? AND b.company_id = ? AND b.appointment_date >= NOW()
        AND b.status NOT IN ('cancelled')
      ORDER BY b.appointment_date ASC
      LIMIT 20
    `, [id, companyId]);

    const [leaves] = await pool.query(
      'SELECT * FROM teacher_leaves WHERE teacher_id = ? AND company_id = ? ORDER BY leave_date DESC LIMIT 20',
      [id, companyId]
    );

    res.json({ teacher, schedule, leaves });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Edit a teacher (permission: can_edit_teacher)
router.put("/teachers/:id", authenticateToken, requireRole('company_admin'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const adminId = req.user.id;
    if (!await canDo(adminId, 'can_edit_teacher')) {
      return res.status(403).json({ message: 'You do not have permission to edit teachers' });
    }
    const { name, email, password } = req.body;
    const { id } = req.params;
    if (password) {
      await pool.query(
        "UPDATE users SET name = ?, email = ?, password = ? WHERE id = ? AND company_id = ? AND role = 'teacher'",
        [name, email, password, id, companyId]
      );
    } else {
      await pool.query(
        "UPDATE users SET name = ?, email = ? WHERE id = ? AND company_id = ? AND role = 'teacher'",
        [name, email, id, companyId]
      );
    }
    await logAction(companyId, adminId, 'teacher_updated', 'user', Number(id), { name, email });
    res.json({ message: 'Teacher updated successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Deactivate a teacher (permission: can_delete_teacher) — soft-delete to preserve history
router.delete("/teachers/:id", authenticateToken, requireRole('company_admin'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const adminId = req.user.id;
    if (!await canDo(adminId, 'can_delete_teacher')) {
      return res.status(403).json({ message: 'You do not have permission to remove teachers' });
    }
    const { id } = req.params;
    const [result] = await pool.query(
      "UPDATE users SET is_active = FALSE WHERE id = ? AND company_id = ? AND role = 'teacher'",
      [id, companyId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Teacher not found' });
    await logAction(companyId, adminId, 'teacher_deactivated', 'user', Number(id), {});
    res.json({ message: 'Teacher removed successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get teacher schedule (upcoming bookings)
router.get("/teachers/:id/schedule", authenticateToken, requireRole('company_admin'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { id } = req.params;
    const [rows] = await pool.query(`
      SELECT b.id, b.appointment_date, b.status,
             u.name AS student_name, tp.package_name
      FROM bookings b
      JOIN student_packages sp ON b.student_package_id = sp.id
      JOIN users u ON sp.student_id = u.id
      JOIN tutorial_packages tp ON sp.package_id = tp.id
      WHERE b.teacher_id = ? AND b.company_id = ? AND b.appointment_date >= NOW()
      ORDER BY b.appointment_date ASC
    `, [id, companyId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ——— Admin (sub-admin) Management ———

// List all company_admin users + permissions
router.get("/admins", authenticateToken, requireRole('company_admin'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const [rows] = await pool.query(`
      SELECT u.id, u.name, u.email, u.is_owner,
             COALESCE(ap.can_add_teacher, FALSE)    AS can_add_teacher,
             COALESCE(ap.can_edit_teacher, FALSE)   AS can_edit_teacher,
             COALESCE(ap.can_delete_teacher, FALSE) AS can_delete_teacher
      FROM users u
      LEFT JOIN admin_permissions ap ON ap.user_id = u.id
      WHERE u.company_id = ? AND u.role = 'company_admin' AND u.is_active = TRUE
      ORDER BY u.is_owner DESC, u.name ASC
    `, [companyId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create sub-admin (owner only)
router.post("/admins", authenticateToken, requireRole('company_admin'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const [[requester]] = await pool.query('SELECT is_owner FROM users WHERE id = ?', [req.user.id]);
    if (!requester?.is_owner) return res.status(403).json({ message: 'Only the company owner can create admins' });

    const { name, email, password, can_add_teacher = false, can_edit_teacher = false, can_delete_teacher = false } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'name, email, and password are required' });

    // Enforce max_admins plan limit
    const [[planLimit]] = await pool.query(
      `SELECT sp.max_admins FROM companies c
       JOIN subscription_plans sp ON c.subscription_plan_id = sp.id
       WHERE c.id = ?`, [companyId]
    );
    if (planLimit) {
      const [[{ cnt }]] = await pool.query(
        "SELECT COUNT(*) AS cnt FROM users WHERE company_id = ? AND role = 'company_admin' AND is_active = TRUE",
        [companyId]
      );
      if (cnt >= planLimit.max_admins) {
        return res.status(400).json({ message: `Admin limit reached (${planLimit.max_admins} max on your plan)` });
      }
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) return res.status(400).json({ message: 'Email already registered' });

    const [result] = await pool.query(
      "INSERT INTO users (company_id, role, name, email, password, is_owner) VALUES (?, 'company_admin', ?, ?, ?, FALSE)",
      [companyId, name, email, password]
    );
    await pool.query(
      `INSERT INTO admin_permissions (user_id, can_add_teacher, can_edit_teacher, can_delete_teacher)
       VALUES (?, ?, ?, ?)`,
      [result.insertId, can_add_teacher, can_edit_teacher, can_delete_teacher]
    );
    await logAction(companyId, req.user.id, 'admin_created', 'user', result.insertId, { name, email });
    res.status(201).json({ message: 'Admin created successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update sub-admin permissions (owner only)
router.put("/admins/:id/permissions", authenticateToken, requireRole('company_admin'), async (req, res) => {
  try {
    const [[requester]] = await pool.query('SELECT is_owner FROM users WHERE id = ?', [req.user.id]);
    if (!requester?.is_owner) return res.status(403).json({ message: 'Only the company owner can edit permissions' });

    const { id } = req.params;
    const { can_add_teacher = false, can_edit_teacher = false, can_delete_teacher = false } = req.body;
    await pool.query(
      `INSERT INTO admin_permissions (user_id, can_add_teacher, can_edit_teacher, can_delete_teacher)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE can_add_teacher = ?, can_edit_teacher = ?, can_delete_teacher = ?`,
      [id, can_add_teacher, can_edit_teacher, can_delete_teacher,
           can_add_teacher, can_edit_teacher, can_delete_teacher]
    );
    await logAction(req.user.company_id, req.user.id, 'admin_permissions_updated', 'user', Number(id), { can_add_teacher, can_edit_teacher, can_delete_teacher });
    res.json({ message: 'Permissions updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete sub-admin (owner only, cannot delete self or another owner)
router.delete("/admins/:id", authenticateToken, requireRole('company_admin'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const [[requester]] = await pool.query('SELECT is_owner FROM users WHERE id = ?', [req.user.id]);
    if (!requester?.is_owner) return res.status(403).json({ message: 'Only the company owner can delete admins' });

    const { id } = req.params;
    if (Number(id) === req.user.id) return res.status(400).json({ message: 'Cannot delete yourself' });

    const [[target]] = await pool.query('SELECT is_owner FROM users WHERE id = ? AND company_id = ?', [id, companyId]);
    if (!target) return res.status(404).json({ message: 'Admin not found' });
    if (target.is_owner) return res.status(400).json({ message: 'Cannot delete the company owner' });

    await pool.query("UPDATE users SET is_active = FALSE WHERE id = ? AND company_id = ?", [id, companyId]);
    await logAction(companyId, req.user.id, 'admin_deleted', 'user', Number(id), {});
    res.json({ message: 'Admin deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ——— Teacher Leave Management ———

// List all teacher leave requests
router.get("/teacher-leaves", authenticateToken, requireRole('company_admin'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const [rows] = await pool.query(`
      SELECT tl.*, u.name AS teacher_name
      FROM teacher_leaves tl
      JOIN users u ON tl.teacher_id = u.id
      WHERE tl.company_id = ?
      ORDER BY tl.status = 'pending' DESC, tl.leave_date ASC
    `, [companyId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Approve teacher leave
router.post("/teacher-leaves/:id/approve", authenticateToken, requireRole('company_admin'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { id } = req.params;
    const [[leave]] = await pool.query('SELECT * FROM teacher_leaves WHERE id = ? AND company_id = ?', [id, companyId]);
    if (!leave) return res.status(404).json({ message: 'Leave request not found' });

    await pool.query(
      "UPDATE teacher_leaves SET status = 'approved', processed_by = ?, processed_at = NOW() WHERE id = ?",
      [req.user.id, id]
    );
    // Auto-close the slot for that teacher on that date (all times)
    // We mark it as a closed slot so the teacher appears unavailable
    await pool.query(
      `INSERT IGNORE INTO closed_slots (company_id, teacher_id, date, time)
       SELECT ?, ?, ?, time FROM (
         SELECT '07:00' AS time UNION SELECT '07:30' UNION SELECT '08:00' UNION SELECT '08:30'
         UNION SELECT '09:00' UNION SELECT '09:30' UNION SELECT '10:00' UNION SELECT '10:30'
         UNION SELECT '11:00' UNION SELECT '11:30' UNION SELECT '12:00' UNION SELECT '12:30'
         UNION SELECT '13:00' UNION SELECT '13:30' UNION SELECT '14:00' UNION SELECT '14:30'
         UNION SELECT '15:00' UNION SELECT '15:30' UNION SELECT '16:00' UNION SELECT '16:30'
         UNION SELECT '17:00' UNION SELECT '17:30' UNION SELECT '18:00' UNION SELECT '18:30'
         UNION SELECT '19:00' UNION SELECT '19:30' UNION SELECT '20:00' UNION SELECT '20:30'
         UNION SELECT '21:00' UNION SELECT '21:30' UNION SELECT '22:00' UNION SELECT '22:30'
       ) AS times`,
      [companyId, leave.teacher_id, leave.leave_date]
    );
    await logAction(companyId, req.user.id, 'leave_approved', 'teacher_leave', Number(id), { teacher_id: leave.teacher_id, leave_date: leave.leave_date });
    res.json({ message: 'Leave approved and slots closed' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Reject teacher leave
router.post("/teacher-leaves/:id/reject", authenticateToken, requireRole('company_admin'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { id } = req.params;
    await pool.query(
      "UPDATE teacher_leaves SET status = 'rejected', processed_by = ?, processed_at = NOW() WHERE id = ? AND company_id = ?",
      [req.user.id, id, companyId]
    );
    await logAction(companyId, req.user.id, 'leave_rejected', 'teacher_leave', Number(id), {});
    res.json({ message: 'Leave rejected' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get company settings (accessible by company_admin and student roles)
router.get('/company-settings', authenticateToken, async (req, res) => {
  try {
    const [[company]] = await pool.query(
      'SELECT allow_student_pick_teacher, payment_qr_image, cancellation_hours, cancellation_penalty_enabled FROM companies WHERE id = ?',
      [req.user.company_id]
    );
    res.json(company || { allow_student_pick_teacher: true, payment_qr_image: null, cancellation_hours: 1, cancellation_penalty_enabled: false });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update company settings (company_admin only)
router.put('/company-settings', authenticateToken, requireRole('company_admin'), async (req, res) => {
  try {
    const { allow_student_pick_teacher, payment_qr_image, cancellation_hours, cancellation_penalty_enabled } = req.body;
    await pool.query(
      'UPDATE companies SET allow_student_pick_teacher = ?, payment_qr_image = ?, cancellation_hours = ?, cancellation_penalty_enabled = ? WHERE id = ?',
      [allow_student_pick_teacher, payment_qr_image ?? null, cancellation_hours ?? 1, cancellation_penalty_enabled ?? false, req.user.company_id]
    );
    await logAction(req.user.company_id, req.user.id, 'company_settings_updated', 'company', req.user.company_id, { allow_student_pick_teacher, cancellation_hours, cancellation_penalty_enabled });
    res.json({ message: 'Settings updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all student feedback for this company
router.get('/feedback', authenticateToken, requireRole('company_admin'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT sf.id, sf.message, sf.created_at,
              s.name AS student_name,
              t.name AS teacher_name
       FROM student_feedback sf
       JOIN users s ON sf.student_id = s.id
       LEFT JOIN users t ON sf.teacher_id = t.id
       WHERE sf.company_id = ?
       ORDER BY sf.created_at DESC`,
      [req.user.company_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ——— Student Management ———

// Get student profile + booking history (company_admin only)
router.get('/students/:id', authenticateToken, requireRole('company_admin'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { id } = req.params;

    const [[student]] = await pool.query(
      'SELECT id, name, email, guardian_name, nationality, age, created_at FROM users WHERE id = ? AND company_id = ? AND role = ?',
      [id, companyId, 'student']
    );
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const [[activePackage]] = await pool.query(
      `SELECT sp.id, sp.sessions_remaining, sp.payment_status, sp.subject, sp.teacher_id,
              tp.package_name, tp.price
       FROM student_packages sp
       JOIN tutorial_packages tp ON sp.package_id = tp.id
       WHERE sp.student_id = ? AND sp.company_id = ?
       ORDER BY sp.purchased_at DESC LIMIT 1`,
      [id, companyId]
    );

    const [bookings] = await pool.query(
      `SELECT b.id, b.appointment_date, b.status, b.class_mode, b.meeting_link,
              b.student_absent, b.teacher_absent,
              u.name AS teacher_name,
              CASE WHEN cr.id IS NOT NULL THEN TRUE ELSE FALSE END AS has_report
       FROM bookings b
       LEFT JOIN users u ON b.teacher_id = u.id
       LEFT JOIN class_reports cr ON cr.booking_id = b.id
       WHERE b.company_id = ? AND b.student_package_id IN (
           SELECT id FROM student_packages WHERE student_id = ? AND company_id = ?
       )
       ORDER BY b.appointment_date DESC`,
      [companyId, id, companyId]
    );

    res.json({ student, activePackage: activePackage || null, bookings });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update student profile (company_admin only)
router.put('/students/:id', authenticateToken, requireRole('company_admin'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { id } = req.params;
    const { name, email, guardian_name, nationality, age } = req.body;

    if (!name || !email) return res.status(400).json({ message: 'Name and email are required' });

    // Ensure the student belongs to this company
    const [[student]] = await pool.query(
      "SELECT id FROM users WHERE id = ? AND company_id = ? AND role = 'student'",
      [id, companyId]
    );
    if (!student) return res.status(404).json({ message: 'Student not found' });

    // Check email uniqueness (exclude self)
    const [[emailConflict]] = await pool.query(
      'SELECT id FROM users WHERE email = ? AND id != ?', [email, id]
    );
    if (emailConflict) return res.status(400).json({ message: 'Email already in use by another account' });

    await pool.query(
      `UPDATE users SET name = ?, email = ?, guardian_name = ?, nationality = ?, age = ?
       WHERE id = ? AND company_id = ?`,
      [name, email, guardian_name || null, nationality || null, age || null, id, companyId]
    );

    await logAction(companyId, req.user.id, 'student_updated', 'user', Number(id), { name, email });
    res.json({ message: 'Student updated successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin creates a booking for a student
router.post('/bookings', authenticateToken, requireRole('company_admin'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { student_package_id, appointment_date, teacher_id } = req.body;
    if (!student_package_id || !appointment_date) {
      return res.status(400).json({ message: 'student_package_id and appointment_date are required' });
    }

    const [[sp]] = await pool.query(
      'SELECT id, student_id FROM student_packages WHERE id = ? AND company_id = ?',
      [student_package_id, companyId]
    );
    if (!sp) return res.status(404).json({ message: 'Student package not found' });

    // Student-to-Student overlap check
    const [studentOverlap] = await pool.query(
      `SELECT b.id FROM bookings b
       JOIN student_packages spp ON b.student_package_id = spp.id
       WHERE spp.student_id = ? AND b.company_id = ?
         AND b.status NOT IN ('cancelled', 'done')
         AND ABS(TIMESTAMPDIFF(MINUTE, b.appointment_date, ?)) < 30`,
      [sp.student_id, companyId, appointment_date]
    );
    if (studentOverlap.length > 0) {
      return res.status(409).json({ message: 'Student already has a class at this time.' });
    }

    // Teacher-to-Teacher overlap check
    if (teacher_id) {
      const [teacherOverlap] = await pool.query(
        `SELECT id FROM bookings
         WHERE teacher_id = ? AND company_id = ?
           AND status NOT IN ('cancelled', 'done')
           AND ABS(TIMESTAMPDIFF(MINUTE, appointment_date, ?)) < 30`,
        [teacher_id, companyId, appointment_date]
      );
      if (teacherOverlap.length > 0) {
        return res.status(409).json({ message: 'Teacher already has a class at this time.' });
      }
    }

    const [result] = await pool.query(
      `INSERT INTO bookings (company_id, student_package_id, teacher_id, appointment_date, status, rescheduled_by_admin, created_at)
       VALUES (?, ?, ?, ?, 'pending', 1, NOW())`,
      [companyId, student_package_id, teacher_id || null, appointment_date]
    );

    const dateStr = new Date(appointment_date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

    if (teacher_id) {
      await notify({
        userId: teacher_id, companyId,
        type: 'booking_created',
        title: 'New class scheduled',
        message: `Admin scheduled a session for you on ${dateStr}.`,
      });
    }

    await notify({
      userId: sp.student_id, companyId,
      type: 'booking_created',
      title: 'Class scheduled',
      message: `A class has been scheduled for you on ${dateStr}.`,
    });

    await logAction(companyId, req.user.id, 'admin_booking_created', 'booking', result.insertId, { student_id: sp.student_id, appointment_date });
    res.status(201).json({ message: 'Booking created', booking_id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a student (company admin only)
router.post('/students', authenticateToken, requireRole('company_admin'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { name, email, password, guardian_name, nationality, age } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'name, email, and password are required' });

    // Check plan student limit
    const [[company]] = await pool.query(
      `SELECT c.*, sp.max_students FROM companies c
       JOIN subscription_plans sp ON c.subscription_plan_id = sp.id
       WHERE c.id = ?`, [companyId]
    );
    const [[{ cnt }]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM users WHERE company_id = ? AND role = 'student' AND is_active = TRUE", [companyId]
    );
    if (cnt >= company.max_students)
      return res.status(400).json({ message: `Student limit reached (${company.max_students} max on your plan)` });

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0)
      return res.status(400).json({ message: 'Email already registered' });

    await pool.query(
      `INSERT INTO users (company_id, role, name, email, password, guardian_name, nationality, age)
       VALUES (?, 'student', ?, ?, ?, ?, ?, ?)`,
      [companyId, name, email, password, guardian_name || null, nationality || null, age || null]
    );
    const [[newStudent]] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    await logAction(companyId, req.user.id, 'student_created', 'user', newStudent.id, { name, email });
    res.status(201).json({ message: 'Student created successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/analytics — dashboard charts data
router.get('/analytics', authenticateToken, requireRole('company_admin'), async (req, res) => {
  try {
    const companyId = req.user.company_id;

    // Sessions per month (last 6 months) — done bookings
    const [sessionsPerMonth] = await pool.query(
      `SELECT DATE_FORMAT(appointment_date, '%Y-%m') AS month,
              COUNT(*) AS total,
              SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS completed,
              SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
       FROM bookings
       WHERE company_id = ? AND appointment_date >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
       GROUP BY month ORDER BY month ASC`,
      [companyId]
    );

    // Student growth (new students per month, last 6 months)
    const [studentGrowth] = await pool.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS new_students
       FROM users
       WHERE company_id = ? AND role = 'student'
         AND created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
       GROUP BY month ORDER BY month ASC`,
      [companyId]
    );

    // Package revenue (confirmed packages this month)
    const [packageStats] = await pool.query(
      `SELECT tp.package_name, COUNT(*) AS count,
              SUM(tp.price) AS revenue
       FROM student_packages sp
       JOIN tutorial_packages tp ON sp.package_id = tp.id
       WHERE sp.company_id = ? AND sp.payment_status = 'paid'
         AND sp.purchased_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
       GROUP BY tp.id, tp.package_name ORDER BY revenue DESC`,
      [companyId]
    );

    // Summary totals
    const [[totals]] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE company_id = ? AND role = 'student') AS total_students,
         (SELECT COUNT(*) FROM bookings WHERE company_id = ? AND status = 'done') AS total_done,
         (SELECT COUNT(*) FROM bookings WHERE company_id = ? AND status = 'cancelled') AS total_cancelled,
         (SELECT IFNULL(SUM(tp.price), 0) FROM student_packages sp
          JOIN tutorial_packages tp ON sp.package_id = tp.id
          WHERE sp.company_id = ? AND sp.payment_status = 'paid') AS total_revenue`,
      [companyId, companyId, companyId, companyId]
    );

    res.json({ sessionsPerMonth, studentGrowth, packageStats, totals });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/audit-logs — activity log for this company
router.get('/audit-logs', authenticateToken, requireRole('company_admin'), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    const [rows] = await pool.query(
      `SELECT al.id, al.action, al.target_type, al.target_id, al.details, al.created_at,
              u.name AS user_name, u.role AS user_role
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE al.company_id = ?
       ORDER BY al.created_at DESC
       LIMIT ? OFFSET ?`,
      [companyId, limit, offset]
    );

    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM audit_logs WHERE company_id = ?', [companyId]
    );

    res.json({ logs: rows, total });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/admin/users/:id/reset-password — admin resets any user's password in their company
router.put('/users/:id/reset-password', authenticateToken, requireRole('company_admin'), async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters' });

    const [[user]] = await pool.query(
      'SELECT id FROM users WHERE id = ? AND company_id = ?',
      [req.params.id, req.user.company_id]
    );
    if (!user) return res.status(404).json({ message: 'User not found' });

    await pool.query('UPDATE users SET password = ? WHERE id = ?', [password, req.params.id]);
    await logAction(req.user.company_id, req.user.id, 'password_reset_by_admin', 'user', Number(req.params.id), {});
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
