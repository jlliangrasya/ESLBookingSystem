const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const notify = require('../utils/notify');
const { logAction } = require('../utils/audit');

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// POST / — Create recurring schedule + auto-generate bookings
router.post('/', authenticateToken, requireRole('student', 'company_admin'), async (req, res) => {
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
        const weeksCount = Math.min(12, Math.max(1, parseInt(num_weeks) || 4));

        // ── BEGIN TRANSACTION ───────────────────────────────────────────────
        await connection.beginTransaction();

        // ── Lock & fetch package + duration ─────────────────────────────────
        const [spRows] = await connection.query(
            `SELECT sp.id, sp.student_id, sp.teacher_id, sp.sessions_remaining, sp.payment_status,
                    tp.duration_minutes
             FROM student_packages sp
             JOIN tutorial_packages tp ON sp.package_id = tp.id
             WHERE sp.id = ? AND sp.company_id = ? FOR UPDATE`,
            [student_package_id, companyId]
        );
        if (spRows.length === 0) {
            await connection.rollback(); connection.release();
            return res.status(404).json({ message: 'Student package not found' });
        }
        const sp = spRows[0];

        // Students can only create schedules for their own packages
        if (req.user.role === 'student' && sp.student_id !== req.user.id) {
            await connection.rollback(); connection.release();
            return res.status(403).json({ message: 'You can only create recurring schedules for your own packages.' });
        }

        if (sp.payment_status !== 'paid') {
            await connection.rollback(); connection.release();
            return res.status(403).json({ message: 'Package payment has not been confirmed yet.' });
        }
        if (sp.sessions_remaining <= 0) {
            await connection.rollback(); connection.release();
            return res.status(403).json({ message: 'No sessions remaining in this package.' });
        }

        // ── Resolve teacher ─────────────────────────────────────────────────
        let teacherId = teacher_id || sp.teacher_id;
        if (!teacherId) {
            const [companyTeachers] = await connection.query(
                "SELECT id FROM users WHERE company_id = ? AND role = 'teacher' AND is_active = TRUE",
                [companyId]
            );
            if (companyTeachers.length === 1) {
                teacherId = companyTeachers[0].id;
            }
        }
        if (!teacherId) {
            await connection.rollback(); connection.release();
            return res.status(400).json({ message: 'No teacher assigned. Please assign a teacher to the package or specify teacher_id.' });
        }

        // Verify teacher exists and is active
        const [[validTeacher]] = await connection.query(
            "SELECT id FROM users WHERE id = ? AND company_id = ? AND role = 'teacher' AND is_active = TRUE",
            [teacherId, companyId]
        );
        if (!validTeacher) {
            await connection.rollback(); connection.release();
            return res.status(400).json({ message: 'Selected teacher is not valid.' });
        }

        // ── Calculate duration & slots per class ────────────────────────────
        const durationMinutes = sp.duration_minutes || 25;
        const slotsPerClass = Math.max(1, Math.ceil(durationMinutes / 30));

        // ── Generate target dates ───────────────────────────────────────────
        const schedStartDate = start_date ? new Date(start_date + 'T00:00:00') : new Date();
        if (!start_date) {
            schedStartDate.setDate(schedStartDate.getDate() + 1); // default: tomorrow
        }
        schedStartDate.setHours(0, 0, 0, 0);

        const schedEndDate = new Date(schedStartDate);
        schedEndDate.setDate(schedEndDate.getDate() + weeksCount * 7);

        const [baseH, baseM] = start_time.split(':').map(Number);

        const targetDates = [];
        for (const cur = new Date(schedStartDate); cur < schedEndDate; cur.setDate(cur.getDate() + 1)) {
            const dayName = DAY_NAMES[cur.getDay()];
            if (!days_of_week.includes(dayName)) continue;
            targetDates.push(cur.toISOString().split('T')[0]);
        }

        if (targetDates.length === 0) {
            await connection.rollback(); connection.release();
            return res.status(400).json({ message: 'No matching dates found for the selected days and weeks.' });
        }

        // ── Check each date for conflicts ───────────────────────────────────
        const bookableDates = [];
        const skippedDates = [];

        for (const dateStr of targetDates) {
            // Build consecutive slot list for this class
            const slotList = [];
            let skipReason = null;

            for (let i = 0; i < slotsPerClass; i++) {
                const totalMin = baseH * 60 + baseM + i * 30;
                const h = Math.floor(totalMin / 60);
                const m = totalMin % 60;
                if (h >= 23 && m > 0) {
                    skipReason = `Class extends past end of day at ${start_time}`;
                    break;
                }
                slotList.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
            }
            if (skipReason) { skippedDates.push({ date: dateStr, reason: skipReason }); continue; }

            // a) Teacher leave check
            const [leaveRows] = await connection.query(
                `SELECT id FROM teacher_leaves WHERE teacher_id = ? AND company_id = ? AND leave_date = ? AND status IN ('pending', 'approved')`,
                [teacherId, companyId, dateStr]
            );
            if (leaveRows.length > 0) {
                skippedDates.push({ date: dateStr, reason: 'Teacher on leave' }); continue;
            }

            // b) Check all slots available in teacher_available_slots
            let slotMissing = false;
            for (const timeStr of slotList) {
                const [openRows] = await connection.query(
                    `SELECT id FROM teacher_available_slots WHERE company_id = ? AND teacher_id = ? AND slot_date = ? AND TIME_FORMAT(slot_time, '%H:%i') = ?`,
                    [companyId, teacherId, dateStr, timeStr]
                );
                if (openRows.length === 0) {
                    skippedDates.push({ date: dateStr, reason: `Teacher not available at ${timeStr}` });
                    slotMissing = true; break;
                }
            }
            if (slotMissing) continue;

            // c) Closed slot check
            let slotClosed = false;
            for (const timeStr of slotList) {
                const [closedRows] = await connection.query(
                    `SELECT id FROM closed_slots WHERE company_id = ? AND (teacher_id = ? OR teacher_id IS NULL) AND date = ? AND time = ?`,
                    [companyId, teacherId, dateStr, timeStr]
                );
                if (closedRows.length > 0) {
                    skippedDates.push({ date: dateStr, reason: `Slot closed at ${timeStr}` });
                    slotClosed = true; break;
                }
            }
            if (slotClosed) continue;

            // d) Teacher overlap check
            let teacherOverlap = false;
            for (const timeStr of slotList) {
                const slotDatetime = `${dateStr} ${timeStr}:00`;
                const [overlapRows] = await connection.query(
                    `SELECT id FROM bookings WHERE teacher_id = ? AND company_id = ? AND status NOT IN ('cancelled', 'done')
                     AND ABS(TIMESTAMPDIFF(MINUTE, appointment_date, ?)) < 30`,
                    [teacherId, companyId, slotDatetime]
                );
                if (overlapRows.length > 0) {
                    skippedDates.push({ date: dateStr, reason: `Teacher has existing class at ${timeStr}` });
                    teacherOverlap = true; break;
                }
            }
            if (teacherOverlap) continue;

            // e) Student overlap check
            let studentOverlap = false;
            for (const timeStr of slotList) {
                const slotDatetime = `${dateStr} ${timeStr}:00`;
                const [overlapRows] = await connection.query(
                    `SELECT b.id FROM bookings b JOIN student_packages spp ON b.student_package_id = spp.id
                     WHERE spp.student_id = ? AND b.company_id = ? AND b.status NOT IN ('cancelled', 'done')
                     AND ABS(TIMESTAMPDIFF(MINUTE, b.appointment_date, ?)) < 30`,
                    [sp.student_id, companyId, slotDatetime]
                );
                if (overlapRows.length > 0) {
                    skippedDates.push({ date: dateStr, reason: `Student has existing class at ${timeStr}` });
                    studentOverlap = true; break;
                }
            }
            if (studentOverlap) continue;

            // All checks passed — this date is bookable
            bookableDates.push({ date: dateStr, slots: slotList });
        }

        // ── Validate session availability ───────────────────────────────────
        if (bookableDates.length === 0) {
            await connection.rollback(); connection.release();
            return res.status(400).json({
                message: 'No available dates found. All dates have conflicts.',
                skipped_dates: skippedDates,
            });
        }

        if (sp.sessions_remaining < bookableDates.length) {
            await connection.rollback(); connection.release();
            return res.status(403).json({
                message: `Not enough sessions: ${sp.sessions_remaining} remaining, ${bookableDates.length} needed.`,
                sessions_remaining: sp.sessions_remaining,
                sessions_needed: bookableDates.length,
                skipped_dates: skippedDates,
            });
        }

        // ── INSERT recurring schedule ───────────────────────────────────────
        const startDateStr = schedStartDate.toISOString().split('T')[0];
        const endDateStr = schedEndDate.toISOString().split('T')[0];

        const [schedResult] = await connection.query(
            `INSERT INTO recurring_schedules
             (company_id, student_package_id, teacher_id, student_id, days_of_week, start_time,
              duration_minutes, slots_per_class, num_weeks, start_date, end_date,
              total_possible, sessions_booked, skipped_dates, status, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
            [companyId, student_package_id, teacherId, sp.student_id,
             JSON.stringify(days_of_week), start_time,
             durationMinutes, slotsPerClass, weeksCount, startDateStr, endDateStr,
             targetDates.length, bookableDates.length,
             skippedDates.length > 0 ? JSON.stringify(skippedDates) : null,
             createdBy]
        );
        const scheduleId = schedResult.insertId;

        // ── INSERT bookings for each bookable date ──────────────────────────
        const allInsertedIds = [];
        for (const { date, slots } of bookableDates) {
            // Each CLASS gets its own booking_group_id for multi-slot
            const groupId = slotsPerClass > 1 ? crypto.randomUUID() : null;

            for (const timeStr of slots) {
                const appointmentDate = `${date} ${timeStr}:00`;
                const [result] = await connection.query(
                    `INSERT INTO bookings (company_id, student_package_id, teacher_id, appointment_date,
                     status, rescheduled_by_admin, booking_group_id, recurring_schedule_id, created_at)
                     VALUES (?, ?, ?, ?, 'confirmed', 0, ?, ?, NOW())`,
                    [companyId, student_package_id, teacherId, appointmentDate, groupId, scheduleId]
                );
                allInsertedIds.push(result.insertId);
            }
        }

        // ── Deduct sessions (1 per CLASS, not per slot) ─────────────────────
        await connection.query(
            `UPDATE student_packages SET sessions_remaining = GREATEST(0, sessions_remaining - ?)
             WHERE id = ? AND company_id = ?`,
            [bookableDates.length, student_package_id, companyId]
        );

        // ── COMMIT ──────────────────────────────────────────────────────────
        await connection.commit();
        connection.release();

        // ── Notifications (fire-and-forget, after commit) ───────────────────
        const daysStr = days_of_week.join(', ');
        const msg = `Recurring schedule created: ${daysStr} at ${start_time} for ${weeksCount} weeks. ${bookableDates.length} classes booked.`;

        notify({ userId: sp.student_id, companyId, type: 'recurring_schedule_created', title: 'Recurring Schedule Created', message: msg });
        if (teacherId !== createdBy) {
            notify({ userId: teacherId, companyId, type: 'recurring_schedule_created', title: 'Recurring Schedule Created', message: msg });
        }
        const [admins] = await pool.query("SELECT id FROM users WHERE company_id = ? AND role = 'company_admin'", [companyId]);
        Promise.all(admins.map(a => notify({ userId: a.id, companyId, type: 'recurring_schedule_created', title: 'Recurring Schedule Created', message: msg }))).catch(() => {});

        logAction(companyId, createdBy, 'create_recurring_schedule', 'recurring_schedule', scheduleId, {
            sessions_booked: bookableDates.length, days_of_week, start_time, num_weeks: weeksCount
        });

        res.status(201).json({
            message: 'Recurring schedule created',
            schedule_id: scheduleId,
            sessions_booked: bookableDates.length,
            sessions_remaining: sp.sessions_remaining - bookableDates.length,
            skipped_dates: skippedDates,
            total_possible: targetDates.length,
            booking_ids: allInsertedIds,
            duration_minutes: durationMinutes,
            slots_per_class: slotsPerClass,
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
router.post('/:id/cancel', authenticateToken, requireRole('student', 'company_admin'), async (req, res) => {
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
router.post('/:id/bookings/:bookingId/cancel', authenticateToken, requireRole('student', 'company_admin'), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { id, bookingId } = req.params;
        const companyId = req.user.company_id;

        await connection.beginTransaction();

        const [[booking]] = await connection.query(
            `SELECT b.*, sp.student_id
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

        const dateStr = new Date(booking.appointment_date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
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
