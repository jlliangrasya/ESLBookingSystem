const express = require('express');
const router = express.Router();
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const notify = require('../utils/notify');

// Student dashboard
router.get('/dashboard', authenticateToken, requireRole('student'), async (req, res) => {
    try {
        const userId = req.user.id;
        const companyId = req.user.company_id;

        const [studentRows] = await pool.query(
            'SELECT * FROM users WHERE id = ? AND company_id = ?',
            [userId, companyId]
        );
        if (studentRows.length === 0) {
            return res.status(404).json({ message: "Student not found" });
        }
        const student = studentRows[0];

        const [packageRows] = await pool.query(
            `SELECT tp.id, tp.package_name, tp.price,
                    (tp.session_limit - COALESCE((
                        SELECT COUNT(*) FROM bookings WHERE student_package_id = sp.id AND status = 'done'
                    ), 0)) AS sessions_remaining
             FROM student_packages sp
             JOIN tutorial_packages tp ON sp.package_id = tp.id
             WHERE sp.student_id = ? AND sp.company_id = ?
             ORDER BY sp.purchased_at DESC LIMIT 1`,
            [userId, companyId]
        );
        const packageDetails = packageRows.length > 0 ? packageRows[0] : null;

        let bookings = [];
        if (packageDetails) {
            const [spRows] = await pool.query(
                'SELECT id FROM student_packages WHERE student_id = ? AND company_id = ?',
                [userId, companyId]
            );
            const studentPackage = spRows[0];

            if (studentPackage) {
                const [bookingRows] = await pool.query(
                    `SELECT b.id, b.appointment_date, b.status, b.class_mode, b.meeting_link,
                            b.teacher_absent, b.student_absent,
                            u.name AS teacher_name
                     FROM bookings b
                     LEFT JOIN users u ON b.teacher_id = u.id
                     WHERE b.student_package_id = ? AND b.company_id = ?
                       AND DATE(b.appointment_date) >= CURDATE()
                       AND b.status NOT IN ('done', 'cancelled')`,
                    [studentPackage.id, companyId]
                );
                bookings = bookingRows.map(booking => {
                    const appointmentDate = new Date(booking.appointment_date);
                    return {
                        id: booking.id,
                        appointment_date: appointmentDate.toISOString().split('T')[0],
                        appointment_datetime: booking.appointment_date,
                        timeslot: appointmentDate.toLocaleTimeString('en-US', {
                            hour: '2-digit', minute: '2-digit', hour12: true,
                        }),
                        status: booking.status,
                        teacher_name: booking.teacher_name || null,
                        class_mode: booking.class_mode || null,
                        meeting_link: booking.meeting_link || null,
                        teacher_absent: !!booking.teacher_absent,
                        student_absent: !!booking.student_absent,
                    };
                });
            }
        }

        // Absence history for this student
        const [absences] = await pool.query(
            `SELECT b.id, b.appointment_date, b.student_absent, b.teacher_absent,
                    u.name AS teacher_name
             FROM bookings b
             JOIN student_packages sp ON b.student_package_id = sp.id
             LEFT JOIN users u ON b.teacher_id = u.id
             WHERE sp.student_id = ? AND sp.company_id = ?
               AND (b.student_absent = TRUE OR b.teacher_absent = TRUE)
             ORDER BY b.appointment_date DESC`,
            [userId, companyId]
        );

        res.json({ student, package: packageDetails, bookings, absences });
    } catch (error) {
        console.error("Error fetching student dashboard:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

// Student marks teacher as absent (only allowed 15+ minutes after class start)
router.post('/bookings/:id/mark-teacher-absent', authenticateToken, requireRole('student'), async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        // Verify this booking belongs to this student and the 15-min window has passed
        const [[booking]] = await pool.query(
            `SELECT b.id, b.teacher_absent FROM bookings b
             JOIN student_packages sp ON b.student_package_id = sp.id
             WHERE b.id = ? AND sp.student_id = ?
               AND TIMESTAMPADD(MINUTE, 15, b.appointment_date) <= NOW()
               AND b.status NOT IN ('done', 'cancelled')`,
            [id, userId]
        );
        if (!booking) {
            return res.status(400).json({ message: 'Cannot mark absent: booking not found, class has not started 15 minutes ago, or is already closed.' });
        }
        if (booking.teacher_absent) {
            return res.status(400).json({ message: 'Teacher already marked as absent for this class.' });
        }

        await pool.query('UPDATE bookings SET teacher_absent = TRUE WHERE id = ?', [id]);
        res.json({ message: 'Teacher marked as absent' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get student's own profile
router.get('/profile', authenticateToken, requireRole('student'), async (req, res) => {
    try {
        const [[student]] = await pool.query(
            'SELECT id, name, email, guardian_name, nationality, age, timezone FROM users WHERE id = ?',
            [req.user.id]
        );
        res.json(student);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Update student's own profile (name, email, guardian, nationality, age, timezone, optional password)
router.put('/profile', authenticateToken, requireRole('student'), async (req, res) => {
    try {
        const { name, email, guardian_name, nationality, age, password, timezone } = req.body;
        if (!name || !email) return res.status(400).json({ message: 'Name and email are required' });

        if (password) {
            if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
            await pool.query(
                'UPDATE users SET name=?, email=?, guardian_name=?, nationality=?, age=?, password=?, timezone=? WHERE id=?',
                [name, email, guardian_name || null, nationality || null, age || null, password, timezone || 'UTC', req.user.id]
            );
        } else {
            await pool.query(
                'UPDATE users SET name=?, email=?, guardian_name=?, nationality=?, age=?, timezone=? WHERE id=?',
                [name, email, guardian_name || null, nationality || null, age || null, timezone || 'UTC', req.user.id]
            );
        }
        res.json({ message: 'Profile updated successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Submit feedback (student → teacher + admin notified)
router.post('/feedback', authenticateToken, requireRole('student'), async (req, res) => {
    try {
        const studentId = req.user.id;
        const companyId = req.user.company_id;
        const { message } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({ message: 'Feedback message is required' });
        }

        // Find the teacher assigned to the student's most recent active package
        const [[pkg]] = await pool.query(
            `SELECT teacher_id FROM student_packages
             WHERE student_id = ? AND company_id = ?
             ORDER BY purchased_at DESC LIMIT 1`,
            [studentId, companyId]
        );
        const teacherId = pkg?.teacher_id || null;

        // Get student name for notifications
        const [[student]] = await pool.query('SELECT name FROM users WHERE id = ?', [studentId]);

        await pool.query(
            'INSERT INTO student_feedback (company_id, student_id, teacher_id, message) VALUES (?, ?, ?, ?)',
            [companyId, studentId, teacherId, message.trim()]
        );

        // Notify the assigned teacher
        if (teacherId) {
            await notify({
                userId: teacherId, companyId,
                type: 'student_feedback',
                title: 'New Student Feedback',
                message: `${student.name} left you feedback.`,
            });
        }

        // Notify all company admins
        const [admins] = await pool.query(
            "SELECT id FROM users WHERE company_id = ? AND role = 'company_admin'",
            [companyId]
        );
        await Promise.all(admins.map(admin => notify({
            userId: admin.id, companyId,
            type: 'student_feedback',
            title: 'New Student Feedback',
            message: `${student.name} submitted feedback${teacherId ? ' for their teacher' : ''}.`,
        })));

        res.status(201).json({ message: 'Feedback submitted successfully' });
    } catch (err) {
        console.error('Error submitting feedback:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// List active teachers in this student's company (for optional teacher selection)
router.get('/teachers', authenticateToken, requireRole('student'), async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const [rows] = await pool.query(
            "SELECT id, name FROM users WHERE company_id = ? AND role = 'teacher' AND is_active = TRUE ORDER BY name ASC",
            [companyId]
        );
        res.json(rows);
    } catch (err) {
        console.error("Error fetching teachers for student:", err);
        res.status(500).json({ message: 'Server error' });
    }
});

// All students in this company (company_admin only) — paginated
router.get("/students", authenticateToken, requireRole('company_admin'), async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
        const offset = (page - 1) * limit;
        const search = req.query.search || '';

        let searchClause = '';
        const params = [companyId, companyId];
        if (search) {
            searchClause = 'AND (u.name LIKE ? OR u.email LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }
        params.push(limit, offset);

        const [rows] = await pool.query(`
            SELECT
                u.id, u.name, u.email, u.guardian_name, u.nationality, u.age, u.created_at,
                sp.payment_status, sp.subject, sp.package_id,
                tp.package_name,
                (tp.session_limit - COALESCE((
                    SELECT COUNT(*) FROM bookings WHERE student_package_id = sp.id AND status = 'done'
                ), 0)) AS sessions_remaining,
                CASE WHEN sp.payment_status = 'paid' AND (tp.session_limit - COALESCE((
                    SELECT COUNT(*) FROM bookings WHERE student_package_id = sp.id AND status = 'done'
                ), 0)) = 0 THEN TRUE ELSE FALSE END AS enrolled
            FROM users u
            LEFT JOIN (
                SELECT sp2.*, ROW_NUMBER() OVER (PARTITION BY sp2.student_id ORDER BY sp2.purchased_at DESC) AS rn
                FROM student_packages sp2 WHERE sp2.company_id = ?
            ) sp ON u.id = sp.student_id AND sp.rn = 1
            LEFT JOIN tutorial_packages tp ON sp.package_id = tp.id
            WHERE u.role = 'student' AND u.company_id = ?
            ${searchClause}
            ORDER BY u.id
            LIMIT ? OFFSET ?
        `, params);

        // Get total count for pagination metadata
        const countParams = [companyId];
        let countSearchClause = '';
        if (search) {
            countSearchClause = 'AND (name LIKE ? OR email LIKE ?)';
            countParams.push(`%${search}%`, `%${search}%`);
        }
        const [[{ total }]] = await pool.query(
            `SELECT COUNT(*) AS total FROM users WHERE role = 'student' AND company_id = ? ${countSearchClause}`,
            countParams
        );

        res.json({ data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    } catch (err) {
        console.error("Error fetching students:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// Pending student packages in this company
router.get("/student-packages/pending", authenticateToken, requireRole('company_admin'), async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const [rows] = await pool.query(`
            SELECT sp.id, sp.student_id, sp.package_id, sp.subject, sp.payment_status,
                   sp.receipt_image, sp.teacher_id, sp.purchased_at,
                   u.name AS student_name, tp.package_name, tp.subject AS package_subject,
                   (tp.session_limit - COALESCE((
                       SELECT COUNT(*) FROM bookings WHERE student_package_id = sp.id AND status = 'done'
                   ), 0)) AS sessions_remaining
            FROM student_packages sp
            JOIN users u ON sp.student_id = u.id
            JOIN tutorial_packages tp ON sp.package_id = tp.id
            WHERE sp.payment_status = 'unpaid' AND sp.company_id = ?
              AND (tp.session_limit - COALESCE((
                  SELECT COUNT(*) FROM bookings WHERE student_package_id = sp.id AND status = 'done'
              ), 0)) > 0
            ORDER BY sp.purchased_at DESC
        `, [companyId]);
        res.json(rows);
    } catch (err) {
        console.error("Error fetching pending packages:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// Paid student packages in this company
router.get("/student-packages/paid", authenticateToken, requireRole('company_admin'), async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const [rows] = await pool.query(`
            SELECT sp.id, sp.student_id, sp.package_id, sp.subject, sp.payment_status,
                   sp.receipt_image, sp.teacher_id, sp.purchased_at,
                   u.name AS student_name,
                   (tp.session_limit - COALESCE((
                       SELECT COUNT(*) FROM bookings WHERE student_package_id = sp.id AND status = 'done'
                   ), 0)) AS sessions_remaining
            FROM student_packages sp
            JOIN users u ON sp.student_id = u.id
            JOIN tutorial_packages tp ON sp.package_id = tp.id
            WHERE sp.payment_status = 'paid' AND sp.company_id = ?
              AND (tp.session_limit - COALESCE((
                  SELECT COUNT(*) FROM bookings WHERE student_package_id = sp.id AND status = 'done'
              ), 0)) > 0
            ORDER BY sp.purchased_at DESC
        `, [companyId]);
        res.json(rows);
    } catch (err) {
        console.error("Error fetching paid packages:", err);
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;
