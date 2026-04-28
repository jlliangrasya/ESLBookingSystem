const express = require('express');
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const notify = require('../utils/notify');
const { logAction } = require('../utils/audit');
const { notifyWaitlistForSlot } = require('./waitlistRoutes');

const router = express.Router();

/** Current time as a JS Date — let MySQL handle comparisons via NOW().
 *  For queries that need a JS-side datetime string, use the server's current time.
 *  Appointments are stored as absolute datetime values. */
function nowDatetime() {
    // appointment_date is stored in PHT (UTC+8) — use Manila time for comparison
    return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Manila' }).replace('T', ' ');
}
function todayDate() {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Manila' });
}

/**
 * Group multi-slot bookings by booking_group_id.
 * Keeps only the first slot per group, adds slot_count.
 * Solo bookings (no group) pass through with slot_count = 1.
 */
function groupMultiSlotBookings(rows) {
    const groups = new Map();
    for (const row of rows) {
        const key = row.booking_group_id || `solo_${row.id}`;
        if (!groups.has(key)) {
            groups.set(key, { ...row, slot_count: 1 });
        } else {
            groups.get(key).slot_count++;
        }
    }
    return Array.from(groups.values());
}

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
                tp.duration_minutes,
                sp.sessions_remaining,
                sp.sessions_remaining + (
                  SELECT COUNT(DISTINCT COALESCE(b.booking_group_id, CAST(b.id AS CHAR)))
                  FROM bookings b WHERE b.student_package_id = sp.id AND b.status NOT IN ('done','cancelled')
                ) AS unused_sessions,
                sp.subject,
                sp.payment_status
            FROM student_packages sp
            JOIN users u ON sp.student_id = u.id
            JOIN tutorial_packages tp ON sp.package_id = tp.id
            WHERE sp.teacher_id = ? AND sp.company_id = ?
            ORDER BY u.name ASC
        `, [teacherId, companyId]);

        // Auto-mark past confirmed/pending bookings as 'done'
        // Safe because sessions are already deducted at booking time (no double-deduction)
        // NOTE: Do NOT auto-mark past bookings as 'done' here.
        // The teacher should explicitly confirm each class via "Confirm Classes" section.
        // Auto-mark-done is only on the admin's completed-bookings endpoint.

        // Upcoming bookings for this teacher
        const [bookingRows] = await pool.query(`
            SELECT
                b.id,
                b.appointment_date,
                b.status,
                b.class_mode,
                b.meeting_link,
                b.student_absent,
                b.booking_group_id,
                b.recurring_schedule_id,
                u.name AS student_name,
                tp.duration_minutes,
                sp.subject
            FROM bookings b
            JOIN student_packages sp ON b.student_package_id = sp.id
            JOIN users u ON sp.student_id = u.id
            JOIN tutorial_packages tp ON sp.package_id = tp.id
            WHERE b.teacher_id = ? AND b.company_id = ?
              AND DATE(b.appointment_date) >= ?
              AND b.status NOT IN ('done', 'cancelled')
            ORDER BY b.appointment_date ASC
        `, [teacherId, companyId, todayDate()]);
        const bookings = groupMultiSlotBookings(bookingRows);

        // Completed bookings for this teacher (with has_report flag + absence tracking)
        const [completedRows] = await pool.query(`
            SELECT
                b.id,
                b.appointment_date,
                b.status,
                b.student_absent,
                b.teacher_absent,
                b.booking_group_id,
                u.name AS student_name,
                sp.student_id,
                tp.duration_minutes,
                sp.subject,
                CASE WHEN cr.id IS NOT NULL THEN TRUE ELSE FALSE END AS has_report
            FROM bookings b
            JOIN student_packages sp ON b.student_package_id = sp.id
            JOIN users u ON sp.student_id = u.id
            JOIN tutorial_packages tp ON sp.package_id = tp.id
            LEFT JOIN class_reports cr ON cr.booking_id = b.id
            WHERE b.teacher_id = ? AND b.company_id = ? AND b.status = 'done'
            ORDER BY b.appointment_date ASC
            LIMIT 100
        `, [teacherId, companyId]);
        // Group ASC so earliest slot is representative, then reverse for most-recent-first display
        const completedBookings = groupMultiSlotBookings(completedRows).reverse().slice(0, 20);

        // Classes this week / month + weekly detail stats — all run in parallel
        const [
            [[weekRow]],
            [[monthRow]],
            [[healthRow]],
            [[completedReportRow]],
            [[absentStudentsRow]],
            [[fiftyMinRow]],
            [[twentyFiveMinRow]],
        ] = await Promise.all([
            pool.query(`
                SELECT COUNT(DISTINCT COALESCE(booking_group_id, CAST(id AS CHAR))) AS classes_this_week
                FROM bookings
                WHERE teacher_id = ? AND company_id = ?
                  AND status IN ('confirmed', 'done')
                  AND YEARWEEK(appointment_date, 1) = YEARWEEK(?, 1)
            `, [teacherId, companyId, todayDate()]),

            pool.query(`
                SELECT COUNT(DISTINCT COALESCE(booking_group_id, CAST(id AS CHAR))) AS classes_this_month
                FROM bookings
                WHERE teacher_id = ? AND company_id = ?
                  AND status IN ('confirmed', 'done')
                  AND YEAR(appointment_date) = YEAR(?)
                  AND MONTH(appointment_date) = MONTH(?)
            `, [teacherId, companyId, todayDate(), todayDate()]),

            pool.query(`
                SELECT COUNT(DISTINCT grp) AS total_done,
                       COUNT(DISTINCT CASE WHEN teacher_absent = TRUE THEN grp END) AS total_absent
                FROM (SELECT COALESCE(booking_group_id, CAST(id AS CHAR)) AS grp, teacher_absent
                      FROM bookings WHERE teacher_id = ? AND company_id = ? AND status = 'done') t
            `, [teacherId, companyId]),

            // Completed classes this week that have a submitted report
            pool.query(`
                SELECT COUNT(DISTINCT COALESCE(b.booking_group_id, CAST(b.id AS CHAR))) AS completed_with_report
                FROM bookings b
                WHERE b.teacher_id = ? AND b.company_id = ?
                  AND b.status = 'done'
                  AND EXISTS (SELECT 1 FROM class_reports cr WHERE cr.booking_id = b.id)
                  AND YEARWEEK(b.appointment_date, 1) = YEARWEEK(?, 1)
            `, [teacherId, companyId, todayDate()]),

            // Students marked absent this week
            pool.query(`
                SELECT COUNT(DISTINCT COALESCE(booking_group_id, CAST(id AS CHAR))) AS absent_students
                FROM bookings
                WHERE teacher_id = ? AND company_id = ?
                  AND status = 'done' AND student_absent = TRUE
                  AND YEARWEEK(appointment_date, 1) = YEARWEEK(?, 1)
            `, [teacherId, companyId, todayDate()]),

            // 50-minute classes this week
            pool.query(`
                SELECT COUNT(DISTINCT COALESCE(b.booking_group_id, CAST(b.id AS CHAR))) AS fifty_min
                FROM bookings b
                JOIN student_packages sp ON b.student_package_id = sp.id
                JOIN tutorial_packages tp ON sp.package_id = tp.id
                WHERE b.teacher_id = ? AND b.company_id = ?
                  AND b.status = 'done'
                  AND tp.duration_minutes = 50
                  AND YEARWEEK(b.appointment_date, 1) = YEARWEEK(?, 1)
            `, [teacherId, companyId, todayDate()]),

            // 25-minute classes this week
            pool.query(`
                SELECT COUNT(DISTINCT COALESCE(b.booking_group_id, CAST(b.id AS CHAR))) AS twenty_five_min
                FROM bookings b
                JOIN student_packages sp ON b.student_package_id = sp.id
                JOIN tutorial_packages tp ON sp.package_id = tp.id
                WHERE b.teacher_id = ? AND b.company_id = ?
                  AND b.status = 'done'
                  AND tp.duration_minutes = 25
                  AND YEARWEEK(b.appointment_date, 1) = YEARWEEK(?, 1)
            `, [teacherId, companyId, todayDate()]),
        ]);

        res.json({
            teacher, students, bookings, completedBookings,
            classes_this_week: weekRow.classes_this_week,
            classes_this_month: monthRow.classes_this_month,
            completed_with_report_this_week: completedReportRow.completed_with_report || 0,
            absent_students_this_week: absentStudentsRow.absent_students || 0,
            fifty_min_this_week: fiftyMinRow.fifty_min || 0,
            twenty_five_min_this_week: twentyFiveMinRow.twenty_five_min || 0,
            health: {
                total_done: healthRow.total_done || 0,
                total_absent: healthRow.total_absent || 0,
                attended: (healthRow.total_done || 0) - (healthRow.total_absent || 0),
            },
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

// Bulk update class mode and meeting link for multiple upcoming bookings
router.put('/bookings/bulk-class-info', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const { booking_ids, class_mode, meeting_link } = req.body;
        const teacherId = req.user.id;

        if (!Array.isArray(booking_ids) || booking_ids.length === 0) {
            return res.status(400).json({ message: 'booking_ids must be a non-empty array' });
        }
        if (booking_ids.length > 100) {
            return res.status(400).json({ message: 'Cannot update more than 100 bookings at once' });
        }

        const placeholders = booking_ids.map(() => '?').join(',');
        const [rows] = await pool.query(
            `SELECT id FROM bookings WHERE id IN (${placeholders}) AND teacher_id = ? AND appointment_date >= ?`,
            [...booking_ids, teacherId, nowDatetime()]
        );

        if (rows.length !== booking_ids.length) {
            return res.status(400).json({
                message: `Only ${rows.length} of ${booking_ids.length} bookings are valid (must belong to you and be upcoming)`
            });
        }

        await pool.query(
            `UPDATE bookings SET class_mode = ?, meeting_link = ? WHERE id IN (${placeholders}) AND teacher_id = ?`,
            [class_mode || null, meeting_link || null, ...booking_ids, teacherId]
        );

        res.json({ message: `Class info updated for ${booking_ids.length} booking(s)` });
    } catch (err) {
        console.error(err);
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
            'SELECT id FROM bookings WHERE id = ? AND teacher_id = ? AND appointment_date >= ?',
            [id, teacherId, nowDatetime()]
        );
        if (!booking) return res.status(404).json({ message: 'Booking not found or not editable' });

        await pool.query(
            'UPDATE bookings SET class_mode = ?, meeting_link = ? WHERE id = ? AND teacher_id = ?',
            [class_mode || null, meeting_link || null, id, teacherId]
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
            `SELECT id, student_absent, booking_group_id FROM bookings
             WHERE id = ? AND teacher_id = ?
               AND TIMESTAMPADD(MINUTE, 15, appointment_date) <= ?
               AND status NOT IN ('done', 'cancelled')`,
            [id, teacherId, nowDatetime()]
        );
        if (!booking) {
            return res.status(400).json({ message: 'Cannot mark absent: booking not found, class has not started 15 minutes ago, or is already closed.' });
        }
        if (booking.student_absent) {
            return res.status(400).json({ message: 'Student already marked as absent for this class.' });
        }

        // Mark all slots in the group as student absent
        if (booking.booking_group_id) {
            await pool.query('UPDATE bookings SET student_absent = TRUE WHERE booking_group_id = ? AND teacher_id = ?', [booking.booking_group_id, teacherId]);
        } else {
            await pool.query('UPDATE bookings SET student_absent = TRUE WHERE id = ? AND teacher_id = ?', [id, teacherId]);
        }
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
            `SELECT b.id, b.appointment_date, b.teacher_id, b.student_package_id, sp.student_id, u.name AS student_name
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

        // Group-aware: cancel all slots in the multi-slot group
        const [[fullBooking]] = await pool.query("SELECT booking_group_id FROM bookings WHERE id = ?", [id]);
        if (fullBooking?.booking_group_id) {
            await pool.query(
                "UPDATE bookings SET status = 'cancelled' WHERE booking_group_id = ? AND company_id = ? AND status NOT IN ('done', 'cancelled')",
                [fullBooking.booking_group_id, companyId]
            );
        } else {
            await pool.query("UPDATE bookings SET status = 'cancelled' WHERE id = ? AND teacher_id = ? AND company_id = ?", [id, teacherId, companyId]);
        }

        // Refund 1 session — one class = one session regardless of slot count
        await pool.query(
            `UPDATE student_packages SET sessions_remaining = sessions_remaining + 1
             WHERE id = ? AND company_id = ?`,
            [booking.student_package_id, companyId]
        );

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

        // Issue #6: Notify waitlisted students when slot opens
        if (booking.teacher_id) {
            notifyWaitlistForSlot(companyId, booking.teacher_id, booking.appointment_date);
        }

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

// GET /api/teacher/completed-classes?month=&year= — completed classes for a specific month
router.get('/completed-classes', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const teacherId = req.user.id;
        const companyId = req.user.company_id;
        const month = parseInt(req.query.month) || new Date().getMonth() + 1;
        const year = parseInt(req.query.year) || new Date().getFullYear();

        const [rows] = await pool.query(`
            SELECT b.id, b.appointment_date, b.status, b.student_absent, b.teacher_absent,
                   b.booking_group_id,
                   u.name AS student_name, sp.student_id, tp.duration_minutes, sp.subject,
                   CASE WHEN cr.id IS NOT NULL THEN TRUE ELSE FALSE END AS has_report
            FROM bookings b
            JOIN student_packages sp ON b.student_package_id = sp.id
            JOIN users u ON sp.student_id = u.id
            JOIN tutorial_packages tp ON sp.package_id = tp.id
            LEFT JOIN class_reports cr ON cr.booking_id = b.id
            WHERE b.teacher_id = ? AND b.company_id = ? AND b.status = 'done'
              AND YEAR(b.appointment_date) = ? AND MONTH(b.appointment_date) = ?
            ORDER BY b.appointment_date ASC
        `, [teacherId, companyId, year, month]);

        res.json(groupMultiSlotBookings(rows).reverse());
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
            SELECT COUNT(DISTINCT COALESCE(booking_group_id, CAST(id AS CHAR))) AS class_count
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

// GET /api/teacher/pending-confirmation — past bookings still needing teacher confirmation
router.get('/pending-confirmation', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const teacherId = req.user.id;
        const companyId = req.user.company_id;
        const [rows] = await pool.query(`
            SELECT
                b.id, b.appointment_date, b.status, b.student_absent,
                b.student_package_id, b.booking_group_id,
                u.name AS student_name,
                sp.student_id,
                tp.duration_minutes,
                sp.subject
            FROM bookings b
            JOIN student_packages sp ON b.student_package_id = sp.id
            JOIN users u ON sp.student_id = u.id
            JOIN tutorial_packages tp ON sp.package_id = tp.id
            WHERE b.teacher_id = ? AND b.company_id = ?
              AND b.appointment_date < ?
              AND b.status IN ('pending', 'confirmed')
            ORDER BY b.appointment_date ASC
        `, [teacherId, companyId, nowDatetime()]);
        res.json(groupMultiSlotBookings(rows));
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/teacher/bookings/:id/done — teacher confirms class happened, deducts session
router.post('/bookings/:id/done', authenticateToken, requireRole('teacher'), async (req, res) => {
    const { id } = req.params;
    const teacherId = req.user.id;
    const companyId = req.user.company_id;

    const connection = await pool.getConnection();
    try {
        const [[booking]] = await pool.query(
            `SELECT b.id, b.student_package_id, b.appointment_date, b.student_absent,
                    b.booking_group_id, sp.student_id, u.name AS student_name
             FROM bookings b
             JOIN student_packages sp ON b.student_package_id = sp.id
             JOIN users u ON sp.student_id = u.id
             WHERE b.id = ? AND b.teacher_id = ? AND b.company_id = ?
               AND b.appointment_date < ?
               AND b.status IN ('pending', 'confirmed')`,
            [id, teacherId, companyId, nowDatetime()]
        );
        if (!booking) return res.status(404).json({ message: 'Booking not found or not eligible for confirmation' });

        await connection.beginTransaction();

        // Mark as done — sessions were already deducted at booking time
        // If part of a multi-slot group, mark ALL slots in the group as done
        if (booking.booking_group_id) {
            await connection.query(
                "UPDATE bookings SET status = 'done' WHERE booking_group_id = ? AND teacher_id = ? AND company_id = ? AND status IN ('pending', 'confirmed')",
                [booking.booking_group_id, teacherId, companyId]
            );
        } else {
            await connection.query(
                "UPDATE bookings SET status = 'done' WHERE id = ? AND teacher_id = ? AND company_id = ?",
                [id, teacherId, companyId]
            );
        }

        await connection.commit();

        // Notify teacher to submit report
        await notify({
            userId: teacherId, companyId,
            type: 'report_due',
            title: 'Class confirmed — report required',
            message: `Please submit your class report for ${booking.student_name}.`,
        });

        // Low-session notifications
        const [[updatedPkg]] = await pool.query(
            `SELECT sessions_remaining, student_id, u.name AS student_name
             FROM student_packages sp JOIN users u ON sp.student_id = u.id
             WHERE sp.id = ?`, [booking.student_package_id]
        );
        if (updatedPkg && updatedPkg.sessions_remaining <= 2 && updatedPkg.sessions_remaining > 0) {
            await notify({
                userId: updatedPkg.student_id, companyId,
                type: 'low_sessions',
                title: 'Low sessions remaining',
                message: `You have ${updatedPkg.sessions_remaining} session(s) left. Please consider enrolling in a new package soon.`,
            });
            const [admins] = await pool.query(
                "SELECT id FROM users WHERE company_id = ? AND role = 'company_admin'", [companyId]
            );
            await Promise.all(admins.map(admin => notify({
                userId: admin.id, companyId,
                type: 'low_sessions',
                title: 'Student low on sessions',
                message: `${updatedPkg.student_name} has only ${updatedPkg.sessions_remaining} session(s) remaining.`,
            })));
        } else if (updatedPkg && updatedPkg.sessions_remaining === 0) {
            await notify({
                userId: updatedPkg.student_id, companyId,
                type: 'package_exhausted',
                title: 'Package exhausted',
                message: 'You have used all your sessions. Please enroll in a new package to continue booking.',
            });
        }

        await logAction(companyId, teacherId, 'booking_confirmed_by_teacher', 'booking', Number(id), { student_name: booking.student_name });
        res.json({ message: 'Class confirmed as done' });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ message: 'Server error' });
    } finally {
        connection.release();
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
        // Normalize DATE objects to "yyyy-MM-dd" strings
        const formatted = rows.map(row => ({
            ...row,
            date: row.date instanceof Date
                ? `${row.date.getUTCFullYear()}-${String(row.date.getUTCMonth()+1).padStart(2,'0')}-${String(row.date.getUTCDate()).padStart(2,'0')}`
                : typeof row.date === 'string' ? row.date.split('T')[0] : row.date,
        }));
        res.json(formatted);
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

// GET /api/teacher/weekly-slots?startDate=YYYY-MM-DD — teacher's opened slots for the week
router.get('/weekly-slots', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const teacherId = req.user.id;
        const companyId = req.user.company_id;
        const startDate = req.query.startDate || new Date().toISOString().split('T')[0];
        const endDt = new Date(startDate);
        endDt.setDate(endDt.getDate() + 7);
        const endDate = endDt.toISOString().split('T')[0];

        const [rows] = await pool.query(
            `SELECT id,
                    DATE_FORMAT(slot_date, '%Y-%m-%d') AS slot_date,
                    TIME_FORMAT(slot_time, '%H:%i')    AS slot_time
             FROM teacher_available_slots
             WHERE company_id = ? AND teacher_id = ? AND slot_date >= ? AND slot_date < ?
             ORDER BY slot_date ASC, slot_time ASC`,
            [companyId, teacherId, startDate, endDate]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/teacher/weekly-slots — open or close a single slot
router.post('/weekly-slots', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const teacherId = req.user.id;
        const companyId = req.user.company_id;
        const { slot_date, slot_time, action } = req.body;

        if (!slot_date || !slot_time || !action) {
            return res.status(400).json({ message: 'slot_date, slot_time, and action are required' });
        }
        const slotDatetime = new Date(`${slot_date}T${slot_time}`);
        if (slotDatetime < new Date()) {
            return res.status(400).json({ message: 'Cannot modify past slots' });
        }
        if (action === 'open') {
            await pool.query(
                `INSERT IGNORE INTO teacher_available_slots (company_id, teacher_id, slot_date, slot_time) VALUES (?, ?, ?, ?)`,
                [companyId, teacherId, slot_date, slot_time]
            );
        } else if (action === 'close') {
            await pool.query(
                `DELETE FROM teacher_available_slots WHERE company_id = ? AND teacher_id = ? AND slot_date = ? AND slot_time = ?`,
                [companyId, teacherId, slot_date, slot_time]
            );
        } else {
            return res.status(400).json({ message: 'action must be "open" or "close"' });
        }
        res.json({ message: `Slot ${action}d successfully` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/teacher/weekly-slots/recurring — bulk open recurring weekly slots
router.post('/weekly-slots/recurring', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const teacherId = req.user.id;
        const companyId = req.user.company_id;
        const { days, start_time, end_time, weeks } = req.body;

        const validDays = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
        if (!Array.isArray(days) || days.length === 0 || !days.every(d => validDays.includes(d))) {
            return res.status(400).json({ message: 'days must be a non-empty array of valid day names' });
        }
        if (!start_time || !end_time || start_time >= end_time) {
            return res.status(400).json({ message: 'start_time and end_time are required and start_time must be before end_time' });
        }
        const weeksCount = Math.min(12, Math.max(1, parseInt(weeks) || 4));

        // Compute start date = tomorrow (no backfill)
        const startDate = new Date();
        startDate.setDate(startDate.getDate() + 1);
        startDate.setHours(0, 0, 0, 0);

        const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

        // Build all slot values to insert — iterate day by day over the full range
        const values = [];
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + weeksCount * 7);

        const [sh, sm] = start_time.split(':').map(Number);
        const [eh, em] = end_time.split(':').map(Number);
        const endMins = eh * 60 + em;

        for (const cur = new Date(startDate); cur < endDate; cur.setDate(cur.getDate() + 1)) {
            const dayName = dayNames[cur.getDay()];
            if (!days.includes(dayName)) continue;

            const dateStr = cur.toISOString().split('T')[0];

            // Generate 30-min slots from start_time to end_time (exclusive)
            let slotMins = sh * 60 + sm;
            while (slotMins < endMins) {
                const h = Math.floor(slotMins / 60);
                const m = slotMins % 60;
                const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
                values.push([companyId, teacherId, dateStr, timeStr]);
                slotMins += 30;
            }
        }

        if (values.length === 0) {
            return res.json({ message: 'No future slots to create', slotsCreated: 0 });
        }

        const [result] = await pool.query(
            `INSERT IGNORE INTO teacher_available_slots (company_id, teacher_id, slot_date, slot_time) VALUES ?`,
            [values]
        );

        res.json({ message: 'Recurring schedule set', slotsCreated: result.affectedRows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
