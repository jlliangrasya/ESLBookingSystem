const express = require('express');
const router = express.Router();
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const { requirePermission } = require('../utils/permissions');
const notify = require('../utils/notify');
const { logAction } = require('../utils/audit');
const { attendeeSql } = require('../utils/sharedPackages');
const { DAY_NAMES, bookRecurringSchedule } = require('../utils/recurringBooking');

/** Format a stored PHT datetime string for notification messages without UTC shift. */
function fmtAppt(dtStr) {
    if (!dtStr) return 'unknown date';
    const s = String(dtStr);
    const datePart = s.slice(0, 10);
    const timePart = s.slice(11, 16);
    const [hh, mm] = timePart.split(':').map(Number);
    const ampm = hh >= 12 ? 'PM' : 'AM';
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    const [y, mo, d] = datePart.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[Number(mo) - 1]} ${Number(d)}, ${y} ${h12}:${String(mm).padStart(2,'0')} ${ampm}`;
}

// POST / — Create recurring schedule + auto-generate bookings
router.post('/', authenticateToken, requireRole('student', 'company_admin'), requirePermission('students.book_classes'), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const companyId = req.user.company_id;
        const createdBy = req.user.id;
        let { student_package_id, teacher_id, days_of_week, start_time, num_weeks, start_date } = req.body;

        // ── Validate input ──────────────────────────────────────────────────
        if (!student_package_id || !days_of_week || !start_time || !num_weeks) {
            connection.release();
            return res.status(400).json({ message: 'student_package_id, days_of_week, start_time, and num_weeks are required' });
        }
        if (!Array.isArray(days_of_week) || days_of_week.length === 0 || !days_of_week.every(d => DAY_NAMES.includes(d))) {
            connection.release();
            return res.status(400).json({ message: 'days_of_week must be a non-empty array of valid day names (Monday-Sunday)' });
        }

        // ── BEGIN TRANSACTION ───────────────────────────────────────────────
        await connection.beginTransaction();

        const booked = await bookRecurringSchedule(connection, {
            companyId, actorRole: req.user.role, actorId: createdBy,
            studentPackageId: student_package_id, studentId: req.body.student_id,
            teacherId: teacher_id, daysOfWeek: days_of_week, startTime: start_time,
            numWeeks: num_weeks, startDate: start_date,
        });
        if (booked.error) {
            await connection.rollback(); connection.release();
            return res.status(booked.error.status).json(booked.error.body);
        }
        const { scheduleId, attendeeId, teacherId, weeksCount } = booked;

        // ── COMMIT ──────────────────────────────────────────────────────────
        await connection.commit();
        connection.release();

        // ── Notifications (fire-and-forget, after commit) ───────────────────
        const daysStr = days_of_week.join(', ');
        const msg = `Recurring schedule created: ${daysStr} at ${start_time} for ${weeksCount} weeks. ${booked.sessionsBooked} classes booked.`;

        notify({ userId: attendeeId, companyId, type: 'recurring_schedule_created', title: 'Recurring Schedule Created', message: msg });
        if (teacherId !== createdBy) {
            notify({ userId: teacherId, companyId, type: 'recurring_schedule_created', title: 'Recurring Schedule Created', message: msg });
        }
        const [admins] = await pool.query("SELECT id FROM users WHERE company_id = ? AND role = 'company_admin'", [companyId]);
        Promise.all(admins.map(a => notify({ userId: a.id, companyId, type: 'recurring_schedule_created', title: 'Recurring Schedule Created', message: msg }))).catch(() => {});

        logAction(companyId, createdBy, 'create_recurring_schedule', 'recurring_schedule', scheduleId, {
            sessions_booked: booked.sessionsBooked, days_of_week, start_time, num_weeks: weeksCount
        });

        res.status(201).json({
            message: 'Recurring schedule created',
            schedule_id: scheduleId,
            sessions_booked: booked.sessionsBooked,
            sessions_remaining: booked.sessionsRemaining,
            skipped_dates: booked.skippedDates,
            total_possible: booked.totalPossible,
            booking_ids: booked.bookingIds,
            duration_minutes: booked.durationMinutes,
            slots_per_class: booked.slotsPerClass,
        });
    } catch (err) {
        try { await connection.rollback(); } catch (_) {}
        connection.release();
        console.error('Create recurring schedule error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET / — List recurring schedules
router.get('/', authenticateToken, requireRole('student', 'teacher', 'company_admin'), async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const { role, id: userId } = req.user;

        let whereClause = 'WHERE rs.company_id = ?';
        const params = [companyId];

        if (role === 'student') {
            whereClause += ' AND rs.student_id = ?';
            params.push(userId);
        } else if (role === 'teacher') {
            whereClause += ' AND rs.teacher_id = ?';
            params.push(userId);
        }

        const [rows] = await pool.query(
            `SELECT rs.*, t.name AS teacher_name, s.name AS student_name, tp.package_name,
                    (SELECT COUNT(DISTINCT COALESCE(b.booking_group_id, CAST(b.id AS CHAR)))
                     FROM bookings b WHERE b.recurring_schedule_id = rs.id AND b.status = 'done') AS completed_classes,
                    (SELECT COUNT(DISTINCT COALESCE(b.booking_group_id, CAST(b.id AS CHAR)))
                     FROM bookings b WHERE b.recurring_schedule_id = rs.id AND b.status NOT IN ('done', 'cancelled')) AS remaining_classes
             FROM recurring_schedules rs
             JOIN users t ON rs.teacher_id = t.id
             JOIN users s ON rs.student_id = s.id
             JOIN student_packages sp ON rs.student_package_id = sp.id
             JOIN tutorial_packages tp ON sp.package_id = tp.id
             ${whereClause}
             ORDER BY rs.created_at DESC`,
            params
        );
        res.json(rows);
    } catch (err) {
        console.error('List recurring schedules error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /:id — Schedule detail with all bookings
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.user.company_id;

        const [[schedule]] = await pool.query(
            `SELECT rs.*, t.name AS teacher_name, s.name AS student_name
             FROM recurring_schedules rs
             JOIN users t ON rs.teacher_id = t.id
             JOIN users s ON rs.student_id = s.id
             WHERE rs.id = ? AND rs.company_id = ?`,
            [id, companyId]
        );
        if (!schedule) return res.status(404).json({ message: 'Schedule not found' });

        const [bookings] = await pool.query(
            `SELECT id, appointment_date, status, booking_group_id, student_absent, teacher_absent
             FROM bookings WHERE recurring_schedule_id = ? AND company_id = ?
             ORDER BY appointment_date ASC`,
            [id, companyId]
        );

        // Group multi-slot bookings for display
        const grouped = new Map();
        for (const b of bookings) {
            const key = b.booking_group_id || `solo_${b.id}`;
            if (!grouped.has(key)) {
                grouped.set(key, { ...b, slot_count: 1 });
            } else {
                grouped.get(key).slot_count++;
            }
        }

        res.json({ ...schedule, bookings: Array.from(grouped.values()) });
    } catch (err) {
        console.error('Schedule detail error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /:id/cancel — Cancel entire series
router.post('/:id/cancel', authenticateToken, requireRole('student', 'company_admin'), requirePermission('students.cancel_classes'), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { id } = req.params;
        const companyId = req.user.company_id;

        await connection.beginTransaction();

        // Fetch schedule
        const [[schedule]] = await connection.query(
            'SELECT * FROM recurring_schedules WHERE id = ? AND company_id = ?',
            [id, companyId]
        );
        if (!schedule) {
            await connection.rollback(); connection.release();
            return res.status(404).json({ message: 'Schedule not found' });
        }
        // Students can only cancel their own schedules
        if (req.user.role === 'student' && schedule.student_id !== req.user.id) {
            await connection.rollback(); connection.release();
            return res.status(403).json({ message: 'You can only cancel your own recurring schedules.' });
        }
        if (schedule.status === 'cancelled') {
            await connection.rollback(); connection.release();
            return res.status(400).json({ message: 'Schedule is already cancelled' });
        }

        // Fetch future cancellable bookings
        const [futureBookings] = await connection.query(
            `SELECT id, student_package_id, booking_group_id
             FROM bookings
             WHERE recurring_schedule_id = ?
               AND appointment_date > CONVERT_TZ(NOW(), '+00:00', '+08:00')
               AND status NOT IN ('done', 'cancelled')`,
            [id]
        );

        // Count distinct classes (group-aware)
        const classSet = new Set();
        for (const b of futureBookings) {
            classSet.add(b.booking_group_id || `solo_${b.id}`);
        }
        const classCount = classSet.size;

        if (classCount > 0) {
            // Cancel all future bookings
            await connection.query(
                `UPDATE bookings SET status = 'cancelled'
                 WHERE recurring_schedule_id = ?
                   AND appointment_date > CONVERT_TZ(NOW(), '+00:00', '+08:00')
                   AND status NOT IN ('done', 'cancelled')`,
                [id]
            );

            // Refund sessions (1 per class, not per slot)
            await connection.query(
                `UPDATE student_packages SET sessions_remaining = sessions_remaining + ?
                 WHERE id = ? AND company_id = ?`,
                [classCount, schedule.student_package_id, companyId]
            );
        }

        // Update schedule status
        await connection.query(
            "UPDATE recurring_schedules SET status = 'cancelled', cancelled_at = NOW() WHERE id = ?",
            [id]
        );

        await connection.commit();
        connection.release();

        // Notifications
        notify({
            userId: schedule.student_id, companyId,
            type: 'recurring_schedule_cancelled',
            title: 'Recurring Schedule Cancelled',
            message: `Your recurring schedule has been cancelled. ${classCount} classes cancelled, ${classCount} sessions refunded.`,
        });
        notify({
            userId: schedule.teacher_id, companyId,
            type: 'recurring_schedule_cancelled',
            title: 'Recurring Schedule Cancelled',
            message: `A recurring schedule has been cancelled. ${classCount} future classes removed.`,
        });

        logAction(companyId, req.user.id, 'cancel_recurring_schedule', 'recurring_schedule', id, { classes_cancelled: classCount });

        res.json({ message: 'Schedule cancelled', cancelled_classes: classCount, sessions_refunded: classCount });
    } catch (err) {
        try { await connection.rollback(); } catch (_) {}
        connection.release();
        console.error('Cancel recurring schedule error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /:id/bookings/:bookingId/cancel — Cancel single occurrence (transaction-wrapped)
router.post('/:id/bookings/:bookingId/cancel', authenticateToken, requireRole('student', 'company_admin'), requirePermission('students.cancel_classes'), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { id, bookingId } = req.params;
        const companyId = req.user.company_id;

        await connection.beginTransaction();

        const [[booking]] = await connection.query(
            `SELECT b.*, ${attendeeSql()} AS student_id
             FROM bookings b
             JOIN student_packages sp ON b.student_package_id = sp.id
             WHERE b.id = ? AND b.recurring_schedule_id = ? AND b.company_id = ?
             FOR UPDATE`,
            [bookingId, id, companyId]
        );
        if (!booking) {
            await connection.rollback(); connection.release();
            return res.status(404).json({ message: 'Booking not found in this schedule' });
        }

        // Students can only cancel their own bookings
        if (req.user.role === 'student' && booking.student_id !== req.user.id) {
            await connection.rollback(); connection.release();
            return res.status(403).json({ message: 'You can only cancel your own bookings.' });
        }

        if (booking.status === 'done' || booking.status === 'cancelled') {
            await connection.rollback(); connection.release();
            return res.status(400).json({ message: 'This booking is already completed or cancelled.' });
        }
        // A late-notice class already earned a half credit — refunding it too would double-count
        if (booking.absence_notice_at) {
            await connection.rollback(); connection.release();
            return res.status(400).json({ message: "This class has a late absence notice (half credit) recorded, so it can't be cancelled. Change its attendance first if the notice was a mistake." });
        }

        // Group-aware cancel (same as bookingRoutes.js:617-635)
        if (booking.booking_group_id) {
            await connection.query(
                "UPDATE bookings SET status = 'cancelled' WHERE booking_group_id = ? AND company_id = ? AND status NOT IN ('done', 'cancelled')",
                [booking.booking_group_id, companyId]
            );
        } else {
            await connection.query(
                "UPDATE bookings SET status = 'cancelled' WHERE id = ? AND company_id = ?",
                [bookingId, companyId]
            );
        }

        // Refund 1 session (1 class = 1 session regardless of slot count)
        await connection.query(
            `UPDATE student_packages SET sessions_remaining = sessions_remaining + 1
             WHERE id = ? AND company_id = ?`,
            [booking.student_package_id, companyId]
        );

        // Check if all bookings in series are now done/cancelled
        const [[{ remaining }]] = await connection.query(
            `SELECT COUNT(*) AS remaining FROM bookings
             WHERE recurring_schedule_id = ? AND status NOT IN ('done', 'cancelled')`,
            [id]
        );
        if (remaining === 0) {
            await connection.query("UPDATE recurring_schedules SET status = 'completed' WHERE id = ?", [id]);
        }

        await connection.commit();
        connection.release();

        const dateStr = fmtAppt(booking.appointment_date);
        notify({
            userId: booking.student_id, companyId,
            type: 'class_cancelled',
            title: 'Class Cancelled',
            message: `Your class on ${dateStr} has been cancelled. 1 session refunded.`,
        });

        res.json({ message: 'Booking cancelled', sessions_refunded: 1 });
    } catch (err) {
        try { await connection.rollback(); } catch (_) {}
        connection.release();
        console.error('Cancel single occurrence error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
