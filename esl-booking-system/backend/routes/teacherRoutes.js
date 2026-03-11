const express = require('express');
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const notify = require('../utils/notify');
const { logAction } = require('../utils/audit');

const router = express.Router();

// Teacher dashboard — assigned students and upcoming bookings
router.get('/dashboard', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const teacherId = req.user.id;
        const companyId = req.user.company_id;

        // Teacher's profile
        const [[teacher]] = await pool.query(
            'SELECT id, name, email FROM users WHERE id = ?',
            [teacherId]
        );

        // Assigned students (via student_packages)
        const [students] = await pool.query(`
            SELECT
                u.id, u.name, u.nationality, u.age,
                tp.package_name,
                sp.sessions_remaining,
                sp.subject,
                sp.payment_status
            FROM student_packages sp
            JOIN users u ON sp.student_id = u.id
            JOIN tutorial_packages tp ON sp.package_id = tp.id
            WHERE sp.teacher_id = ? AND sp.company_id = ?
            ORDER BY u.name ASC
        `, [teacherId, companyId]);

        // Upcoming bookings for this teacher (includes today's past classes so teacher can mark absences)
        const [bookings] = await pool.query(`
            SELECT
                b.id,
                b.appointment_date,
                b.status,
                b.class_mode,
                b.meeting_link,
                b.student_absent,
                u.name AS student_name,
                tp.package_name,
                sp.subject
            FROM bookings b
            JOIN student_packages sp ON b.student_package_id = sp.id
            JOIN users u ON sp.student_id = u.id
            JOIN tutorial_packages tp ON sp.package_id = tp.id
            WHERE b.teacher_id = ? AND b.company_id = ?
              AND DATE(b.appointment_date) >= CURDATE()
              AND b.status NOT IN ('done', 'cancelled')
            ORDER BY b.appointment_date ASC
        `, [teacherId, companyId]);

        // Completed bookings for this teacher (with has_report flag + absence tracking)
        const [completedBookings] = await pool.query(`
            SELECT
                b.id,
                b.appointment_date,
                b.status,
                b.student_absent,
                b.teacher_absent,
                u.name AS student_name,
                sp.student_id,
                tp.package_name,
                sp.subject,
                CASE WHEN cr.id IS NOT NULL THEN TRUE ELSE FALSE END AS has_report
            FROM bookings b
            JOIN student_packages sp ON b.student_package_id = sp.id
            JOIN users u ON sp.student_id = u.id
            JOIN tutorial_packages tp ON sp.package_id = tp.id
            LEFT JOIN class_reports cr ON cr.booking_id = b.id
            WHERE b.teacher_id = ? AND b.company_id = ? AND b.status IN ('confirmed', 'done')
            ORDER BY b.appointment_date DESC
            LIMIT 20
        `, [teacherId, companyId]);

        // Classes this week and this month (confirmed + done)
        const [[weekRow]] = await pool.query(`
            SELECT COUNT(*) AS classes_this_week
            FROM bookings
            WHERE teacher_id = ? AND company_id = ?
              AND status IN ('confirmed', 'done')
              AND YEARWEEK(appointment_date, 1) = YEARWEEK(CURDATE(), 1)
        `, [teacherId, companyId]);

        const [[monthRow]] = await pool.query(`
            SELECT COUNT(*) AS classes_this_month
            FROM bookings
            WHERE teacher_id = ? AND company_id = ?
              AND status IN ('confirmed', 'done')
              AND YEAR(appointment_date) = YEAR(CURDATE())
              AND MONTH(appointment_date) = MONTH(CURDATE())
        `, [teacherId, companyId]);

        res.json({
            teacher, students, bookings, completedBookings,
            classes_this_week: weekRow.classes_this_week,
            classes_this_month: monthRow.classes_this_month,
        });
    } catch (err) {
        console.error('Error fetching teacher dashboard:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get own leave requests
router.get('/leaves', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const teacherId = req.user.id;
        const companyId = req.user.company_id;
        const [rows] = await pool.query(
            'SELECT * FROM teacher_leaves WHERE teacher_id = ? AND company_id = ? ORDER BY leave_date DESC',
            [teacherId, companyId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Submit leave request
router.post('/leaves', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const teacherId = req.user.id;
        const companyId = req.user.company_id;
        const { leave_date, reason_type, notes } = req.body;

        if (!leave_date || !reason_type) {
            return res.status(400).json({ message: 'leave_date and reason_type are required' });
        }

        const [result] = await pool.query(
            `INSERT INTO teacher_leaves (company_id, teacher_id, leave_date, reason_type, notes)
             VALUES (?, ?, ?, ?, ?)`,
            [companyId, teacherId, leave_date, reason_type, notes || null]
        );
        await logAction(companyId, teacherId, 'leave_requested', 'teacher_leave', result.insertId, { leave_date, reason_type });
        res.status(201).json({ message: 'Leave request submitted', id: result.insertId });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Update class mode and meeting link for an upcoming booking
router.put('/bookings/:id/class-info', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const { class_mode, meeting_link } = req.body;
        const teacherId = req.user.id;
        const { id } = req.params;

        const [[booking]] = await pool.query(
            'SELECT id FROM bookings WHERE id = ? AND teacher_id = ? AND appointment_date >= NOW()',
            [id, teacherId]
        );
        if (!booking) return res.status(404).json({ message: 'Booking not found or not editable' });

        await pool.query(
            'UPDATE bookings SET class_mode = ?, meeting_link = ? WHERE id = ?',
            [class_mode || null, meeting_link || null, id]
        );
        res.json({ message: 'Class info updated' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Teacher marks student as absent (only allowed 15+ minutes after class start)
router.post('/bookings/:id/mark-student-absent', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const teacherId = req.user.id;
        const { id } = req.params;

        const [[booking]] = await pool.query(
            `SELECT id, student_absent FROM bookings
             WHERE id = ? AND teacher_id = ?
               AND TIMESTAMPADD(MINUTE, 15, appointment_date) <= NOW()
               AND status NOT IN ('done', 'cancelled')`,
            [id, teacherId]
        );
        if (!booking) {
            return res.status(400).json({ message: 'Cannot mark absent: booking not found, class has not started 15 minutes ago, or is already closed.' });
        }
        if (booking.student_absent) {
            return res.status(400).json({ message: 'Student already marked as absent for this class.' });
        }

        await pool.query('UPDATE bookings SET student_absent = TRUE WHERE id = ?', [id]);
        res.json({ message: 'Student marked as absent' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Teacher cancels a booking (notifies admin + student)
router.post('/bookings/:id/cancel', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const teacherId = req.user.id;
        const companyId = req.user.company_id;
        const { id } = req.params;

        const [[booking]] = await pool.query(
            `SELECT b.id, b.appointment_date, b.teacher_id, sp.student_id, u.name AS student_name
             FROM bookings b
             JOIN student_packages sp ON b.student_package_id = sp.id
             JOIN users u ON sp.student_id = u.id
             WHERE b.id = ? AND b.teacher_id = ? AND b.company_id = ?
               AND b.status NOT IN ('done', 'cancelled')`,
            [id, teacherId, companyId]
        );
        if (!booking) return res.status(404).json({ message: 'Booking not found or already closed' });

        // Enforce company cancellation policy
        const [[company]] = await pool.query(
            'SELECT cancellation_hours FROM companies WHERE id = ?', [companyId]
        );
        const policyHours = company?.cancellation_hours ?? 1;
        const hoursUntilClass = (new Date(booking.appointment_date).getTime() - Date.now()) / (1000 * 60 * 60);

        if (policyHours > 0 && hoursUntilClass < policyHours) {
            // Within window — notify admins about the attempt, but do NOT cancel
            const [[teacher]] = await pool.query('SELECT name FROM users WHERE id = ?', [teacherId]);
            const dateStr = new Date(booking.appointment_date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
            const [admins] = await pool.query(
                "SELECT id FROM users WHERE company_id = ? AND role = 'company_admin'", [companyId]
            );
            await Promise.all(admins.map(admin => notify({
                userId: admin.id, companyId,
                type: 'booking_cancelled',
                title: 'Teacher attempted to cancel',
                message: `${teacher?.name || 'A teacher'} tried to cancel the class with ${booking.student_name} on ${dateStr}. Class proceeds as scheduled.`,
            })));
            return res.status(403).json({
                within_window: true,
                cancellation_hours: policyHours,
                message: `Cancellation is not allowed within ${policyHours} hour(s) of the scheduled class time.`,
            });
        }

        await pool.query("UPDATE bookings SET status = 'cancelled' WHERE id = ?", [id]);

        const dateStr = new Date(booking.appointment_date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
        const [[teacher]] = await pool.query('SELECT name FROM users WHERE id = ?', [teacherId]);

        if (booking.student_id) {
            await notify({
                userId: booking.student_id, companyId,
                type: 'class_cancelled',
                title: 'Class cancelled by teacher',
                message: `Your class on ${dateStr} was cancelled by the teacher.`,
            });
        }

        const [admins] = await pool.query(
            "SELECT id FROM users WHERE company_id = ? AND role = 'company_admin'", [companyId]
        );
        await Promise.all(admins.map(admin => notify({
            userId: admin.id, companyId,
            type: 'booking_cancelled',
            title: 'Class cancelled by teacher',
            message: `${teacher?.name || 'A teacher'} cancelled the class with ${booking.student_name} on ${dateStr}.`,
        })));

        await logAction(companyId, teacherId, 'booking_cancelled_by_teacher', 'booking', Number(id), { student_name: booking.student_name });
        res.json({ message: 'Class cancelled' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Cancel own pending leave
router.delete('/leaves/:id', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const teacherId = req.user.id;
        const companyId = req.user.company_id;
        const { id } = req.params;
        const [result] = await pool.query(
            "DELETE FROM teacher_leaves WHERE id = ? AND teacher_id = ? AND status = 'pending'",
            [id, teacherId]
        );
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Leave request not found or already processed' });
        await logAction(companyId, teacherId, 'leave_cancelled', 'teacher_leave', Number(id), {});
        res.json({ message: 'Leave request cancelled' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get feedback submitted to this teacher
router.get('/feedback', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT sf.id, sf.message, sf.created_at, u.name AS student_name
             FROM student_feedback sf
             JOIN users u ON sf.student_id = u.id
             WHERE sf.teacher_id = ? AND sf.company_id = ?
             ORDER BY sf.created_at DESC`,
            [req.user.id, req.user.company_id]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/teacher/class-stats?month=3&year=2026 — classes in any given month
router.get('/class-stats', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const teacherId = req.user.id;
        const companyId = req.user.company_id;
        const month = parseInt(req.query.month) || new Date().getMonth() + 1;
        const year = parseInt(req.query.year) || new Date().getFullYear();

        const [[row]] = await pool.query(`
            SELECT COUNT(*) AS class_count
            FROM bookings
            WHERE teacher_id = ? AND company_id = ?
              AND status IN ('confirmed', 'done')
              AND YEAR(appointment_date) = ?
              AND MONTH(appointment_date) = ?
        `, [teacherId, companyId, year, month]);

        res.json({ month, year, class_count: row.class_count });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get teacher's own profile
router.get('/profile', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const [[teacher]] = await pool.query(
            'SELECT id, name, email, timezone FROM users WHERE id = ?', [req.user.id]
        );
        res.json(teacher);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Update teacher's own profile (name, email, timezone, optional password)
router.put('/profile', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const { name, email, password, timezone } = req.body;
        const teacherId = req.user.id;
        if (!name || !email) return res.status(400).json({ message: 'Name and email are required' });

        if (password) {
            await pool.query('UPDATE users SET name = ?, email = ?, password = ?, timezone = ? WHERE id = ?',
                [name, email, password, timezone || 'UTC', teacherId]);
        } else {
            await pool.query('UPDATE users SET name = ?, email = ?, timezone = ? WHERE id = ?',
                [name, email, timezone || 'UTC', teacherId]);
        }
        res.json({ message: 'Profile updated successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/teacher/availability — get this teacher's closed slots
router.get('/availability', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const teacherId = req.user.id;
        const companyId = req.user.company_id;
        const [rows] = await pool.query(
            `SELECT id, date, time FROM closed_slots
             WHERE company_id = ? AND teacher_id = ?
             ORDER BY date ASC, time ASC`,
            [companyId, teacherId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/teacher/availability — teacher closes or opens their own slot
// Close: { date, time, action: 'close' }
// Open:  { closed_slot_id, action: 'open' }  OR  { date, time, action: 'open' }
router.post('/availability', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const teacherId = req.user.id;
        const companyId = req.user.company_id;
        const { date, time, action, closed_slot_id } = req.body;

        if (!action) {
            return res.status(400).json({ message: 'action is required' });
        }

        if (action === 'close') {
            if (!date || !time) {
                return res.status(400).json({ message: 'date and time are required to close a slot' });
            }

            // Company policy: teacher can only close slots more than cancellation_hours before the slot
            const [[company]] = await pool.query(
                'SELECT cancellation_hours FROM companies WHERE id = ?', [companyId]
            );
            const policyHours = company?.cancellation_hours ?? 1;
            const slotDatetime = new Date(`${date}T${time.substring(0, 5)}:00`);
            const hoursUntilSlot = (slotDatetime.getTime() - Date.now()) / (1000 * 60 * 60);

            if (hoursUntilSlot <= policyHours) {
                return res.status(403).json({
                    message: `You can only close slots more than ${policyHours} hour(s) before the scheduled time.`,
                });
            }

            await pool.query(
                `INSERT IGNORE INTO closed_slots (company_id, teacher_id, date, time) VALUES (?, ?, ?, ?)`,
                [companyId, teacherId, date, time]
            );
        } else if (action === 'open') {
            if (closed_slot_id) {
                // Open by ID (frontend passes the row id)
                await pool.query(
                    `DELETE FROM closed_slots WHERE id = ? AND company_id = ? AND teacher_id = ?`,
                    [closed_slot_id, companyId, teacherId]
                );
            } else if (date && time) {
                // Open by date + time
                await pool.query(
                    `DELETE FROM closed_slots WHERE company_id = ? AND teacher_id = ? AND date = ? AND time = ?`,
                    [companyId, teacherId, date, time]
                );
            } else {
                return res.status(400).json({ message: 'closed_slot_id or date+time required to open a slot' });
            }
        } else {
            return res.status(400).json({ message: 'action must be "close" or "open"' });
        }

        res.json({ message: `Slot ${action}d successfully` });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
