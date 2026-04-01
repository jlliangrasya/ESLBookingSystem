const express = require("express");
const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");
const notify = require("../utils/notify");
const { logAction } = require("../utils/audit");
const { notifyWaitlistForSlot } = require("./waitlistRoutes");

const router = express.Router();

// Get bookings by student_package_id (students can only view their own)
router.get("/api/bookings", authenticateToken, async (req, res) => {
    try {
        const { student_package_id } = req.query;
        const companyId = req.user.company_id;
        const userId = req.user.id;
        const role = req.user.role;

        // Students can only view their own packages
        if (role === 'student') {
            const [[pkg]] = await pool.query(
                "SELECT id FROM student_packages WHERE id = ? AND student_id = ? AND company_id = ?",
                [student_package_id, userId, companyId]
            );
            if (!pkg) {
                return res.status(403).json({ message: "Access denied" });
            }
        }

        const [rows] = await pool.query(
            "SELECT * FROM bookings WHERE student_package_id = ? AND company_id = ?",
            [student_package_id, companyId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

// Create a booking (student only — status is always 'confirmed', rescheduled_by_admin always false)
// Wrapped in a transaction with row-level locking to prevent race conditions
router.post("/api/bookings", authenticateToken, requireRole('student'), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { student_package_id, appointment_date } = req.body;
        const companyId = req.user.company_id;
        const studentId = req.user.id;

        if (!student_package_id || !appointment_date) {
            connection.release();
            return res.status(400).json({ message: "student_package_id and appointment_date are required" });
        }

        // Server-enforced values — client cannot override these
        const status = 'confirmed';
        const rescheduled_by_admin = false;

        await connection.beginTransaction();

        // Lock the student_package row to prevent concurrent booking races
        const [spRows] = await connection.query(
            `SELECT sp.teacher_id, sp.sessions_remaining, sp.payment_status, tp.duration_minutes
             FROM student_packages sp
             JOIN tutorial_packages tp ON sp.package_id = tp.id
             WHERE sp.id = ? AND sp.company_id = ? FOR UPDATE`,
            [student_package_id, companyId]
        );
        if (spRows.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ message: "Package not found" });
        }

        // Issue #13: Block booking with unpaid package
        if (spRows[0].payment_status !== 'paid') {
            await connection.rollback();
            connection.release();
            return res.status(403).json({ message: "Your package payment has not been confirmed yet. Please wait for admin approval before booking classes." });
        }

        // Calculate slots needed based on duration
        const durationMinutes = spRows[0].duration_minutes || 25;
        const slotsNeeded = Math.max(1, Math.ceil(durationMinutes / 30));

        // Block booking if no sessions remaining (each class = 1 session regardless of duration)
        if (spRows[0].sessions_remaining <= 0) {
            await connection.rollback();
            connection.release();
            return res.status(403).json({ message: "No sessions remaining in your package. Please enroll in a new package." });
        }

        let teacherId = spRows[0].teacher_id;

        // Auto-assign the only teacher if there's exactly one in the company
        if (!teacherId) {
            const [companyTeachers] = await connection.query(
                "SELECT id FROM users WHERE company_id = ? AND role = 'teacher' AND is_active = TRUE",
                [companyId]
            );
            if (companyTeachers.length === 1) {
                teacherId = companyTeachers[0].id;
            }
        }

        // Allow student to pick a teacher if package has no assigned teacher and setting is ON
        if (!teacherId && req.body.teacher_id) {
            const [[company]] = await connection.query(
                'SELECT allow_student_pick_teacher FROM companies WHERE id = ?', [companyId]
            );
            if (!company?.allow_student_pick_teacher) {
                await connection.rollback(); connection.release();
                return res.status(403).json({ message: "Teacher selection is not allowed for this company." });
            }
            const [[validTeacher]] = await connection.query(
                "SELECT id FROM users WHERE id = ? AND company_id = ? AND role = 'teacher' AND is_active = TRUE",
                [req.body.teacher_id, companyId]
            );
            if (!validTeacher) {
                await connection.rollback(); connection.release();
                return res.status(400).json({ message: "Selected teacher is not valid." });
            }
            teacherId = req.body.teacher_id;
        }

        // Build list of consecutive slots to book
        const baseDate = req.body.slot_date || new Date(appointment_date).toISOString().split('T')[0];
        const baseTime = req.body.slot_time || (() => {
            const dt = new Date(appointment_date);
            return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
        })();
        const [baseH, baseM] = baseTime.split(':').map(Number);

        const slotList = [];
        for (let i = 0; i < slotsNeeded; i++) {
            const totalMin = baseH * 60 + baseM + i * 30;
            const h = Math.floor(totalMin / 60);
            const m = totalMin % 60;
            if (h >= 23 && m > 0) {
                await connection.rollback(); connection.release();
                return res.status(409).json({ message: `Cannot book a ${durationMinutes}-minute class at ${baseTime} — not enough timeslots remaining in the day.` });
            }
            const t24 = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
            slotList.push({ slot_date: baseDate, slot_time: t24 });
        }

        // Validate ALL consecutive slots
        const leaveCheckDate = baseDate;
        if (teacherId) {
            // Check teacher leave
            const [leaveRows] = await connection.query(
                `SELECT id FROM teacher_leaves WHERE teacher_id = ? AND company_id = ? AND leave_date = ? AND status IN ('pending', 'approved')`,
                [teacherId, companyId, leaveCheckDate]
            );
            if (leaveRows.length > 0) {
                await connection.rollback(); connection.release();
                return res.status(409).json({ message: "This teacher is on leave on this date. Please choose a different date or teacher." });
            }

            // Check all slots are OPEN in teacher_available_slots
            for (const slot of slotList) {
                const [openRows] = await connection.query(
                    `SELECT id FROM teacher_available_slots WHERE company_id = ? AND teacher_id = ? AND slot_date = ? AND TIME_FORMAT(slot_time, '%H:%i') = ?`,
                    [companyId, teacherId, slot.slot_date, slot.slot_time]
                );
                if (openRows.length === 0) {
                    await connection.rollback(); connection.release();
                    const hr = Number(slot.slot_time.split(':')[0]);
                    const mn = slot.slot_time.split(':')[1];
                    const ampm = hr >= 12 ? 'PM' : 'AM';
                    const h12 = hr % 12 === 0 ? 12 : hr % 12;
                    return res.status(409).json({ message: `Cannot book — your teacher is not available at ${h12}:${mn} ${ampm}.` });
                }
            }
        }

        // Check student overlap for all slots
        for (const slot of slotList) {
            const slotDatetime = `${slot.slot_date} ${slot.slot_time}:00`;
            const [studentOverlap] = await connection.query(
                `SELECT b.id FROM bookings b JOIN student_packages sp ON b.student_package_id = sp.id
                 WHERE sp.student_id = ? AND b.company_id = ? AND b.status NOT IN ('cancelled', 'done')
                 AND ABS(TIMESTAMPDIFF(MINUTE, b.appointment_date, ?)) < 30`,
                [studentId, companyId, slotDatetime]
            );
            if (studentOverlap.length > 0) {
                await connection.rollback(); connection.release();
                return res.status(409).json({ message: `You already have a class booked at ${slot.slot_time}.` });
            }
        }

        // Check teacher overlap for all slots
        if (teacherId) {
            for (const slot of slotList) {
                const slotDatetime = `${slot.slot_date} ${slot.slot_time}:00`;
                const [teacherOverlap] = await connection.query(
                    `SELECT id FROM bookings WHERE teacher_id = ? AND company_id = ? AND status NOT IN ('cancelled', 'done')
                     AND ABS(TIMESTAMPDIFF(MINUTE, appointment_date, ?)) < 30`,
                    [teacherId, companyId, slotDatetime]
                );
                if (teacherOverlap.length > 0) {
                    await connection.rollback(); connection.release();
                    return res.status(409).json({ message: `This teacher already has a class at ${slot.slot_time}. Please choose a different slot.` });
                }
            }
        }

        // Insert all booking rows using display time (matches teacher_available_slots)
        const crypto = require('crypto');
        const groupId = slotsNeeded > 1 ? crypto.randomUUID() : null;
        const insertedIds = [];
        for (const slot of slotList) {
            const slotAppointment = `${slot.slot_date} ${slot.slot_time}:00`;
            const [result] = await connection.query(
                `INSERT INTO bookings (company_id, student_package_id, teacher_id, appointment_date, status, rescheduled_by_admin, booking_group_id, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
                [companyId, student_package_id, teacherId, slotAppointment, status, rescheduled_by_admin, groupId]
            );
            insertedIds.push(result.insertId);
        }

        // Deduct 1 session at booking time — one class = one session regardless of how many 30-min slots it spans
        await connection.query(
            `UPDATE student_packages SET sessions_remaining = GREATEST(0, sessions_remaining - 1)
             WHERE id = ? AND company_id = ?`,
            [student_package_id, companyId]
        );

        await connection.commit();
        connection.release();

        // Notifications
        const [[student]] = await pool.query('SELECT name FROM users WHERE id = ?', [studentId]);
        const dateStr = new Date(appointment_date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
        const slotMsg = slotsNeeded > 1 ? ` (${durationMinutes}-minute class, ${slotsNeeded} slots)` : '';

        if (teacherId) {
            await notify({
                userId: teacherId, companyId,
                type: 'booking_created',
                title: 'New class booked',
                message: `${student.name} booked a session on ${dateStr}${slotMsg}.`,
            });
        }

        const [admins] = await pool.query(
            "SELECT id FROM users WHERE company_id = ? AND role = 'company_admin'", [companyId]
        );
        await Promise.all(admins.map(admin => notify({
            userId: admin.id, companyId,
            type: 'booking_created',
            title: 'New booking',
            message: `${student.name} booked a session on ${dateStr}${slotMsg}.`,
        })));

        await logAction(companyId, studentId, 'booking_created', 'booking', insertedIds[0], { appointment_date, slots_booked: slotsNeeded });

        res.json({ message: "Booking confirmed", booking_id: insertedIds[0], booking_ids: insertedIds, slots_booked: slotsNeeded });
    } catch (err) {
        try { await connection.rollback(); } catch (_) {}
        connection.release();
        console.error("Booking Error:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// Upcoming bookings (company_admin view) — paginated
router.get("/api/student-bookings", authenticateToken, requireRole('company_admin'), async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
        const offset = (page - 1) * limit;

        const [rows] = await pool.query(`
            SELECT
                b.id, b.appointment_date, b.status, b.rescheduled_by_admin,
                b.student_package_id, b.created_at,
                sp.student_id,
                u.name AS student_name,
                tp.package_name,
                t.name AS teacher_name
            FROM bookings b
            JOIN student_packages sp ON b.student_package_id = sp.id
            JOIN users u ON sp.student_id = u.id
            JOIN tutorial_packages tp ON sp.package_id = tp.id
            LEFT JOIN users t ON b.teacher_id = t.id
            WHERE b.appointment_date >= NOW() AND b.company_id = ?
              AND b.status NOT IN ('cancelled')
            ORDER BY b.appointment_date ASC
            LIMIT ? OFFSET ?
        `, [companyId, limit, offset]);

        const [[{ total }]] = await pool.query(
            `SELECT COUNT(*) AS total FROM bookings
             WHERE appointment_date >= NOW() AND company_id = ? AND status NOT IN ('cancelled')`,
            [companyId]
        );

        res.json({ data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    } catch (err) {
        console.error("Error fetching bookings:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// Upcoming bookings (student view)
router.get("/api/student/bookings", authenticateToken, requireRole('student'), async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const studentId = req.user.id;
        const [rows] = await pool.query(
            `SELECT b.id, b.appointment_date, b.status, b.rescheduled_by_admin, b.student_package_id,
                    b.class_mode, b.meeting_link, b.teacher_absent, b.student_absent,
                    t.name AS teacher_name
             FROM bookings b
             JOIN student_packages sp ON b.student_package_id = sp.id
             LEFT JOIN users t ON b.teacher_id = t.id
             WHERE sp.student_id = ? AND b.company_id = ?
               AND b.status NOT IN ('cancelled')
             ORDER BY b.appointment_date ASC`,
            [studentId, companyId]
        );
        res.json(rows.length === 0 ? [] : rows);
    } catch (err) {
        console.error("Error fetching student bookings:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// Completed bookings (auto-mark past pending as done) — paginated
router.get("/api/completed-bookings", authenticateToken, requireRole('company_admin'), async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
        const offset = (page - 1) * limit;

        // Auto mark-done removed: classes should be explicitly confirmed by teacher or admin
        // Sessions are deducted at booking time, so no session impact here

        const [rows] = await pool.query(`
            SELECT
                b.id, b.appointment_date, b.status, b.rescheduled_by_admin,
                b.student_package_id, b.created_at,
                u.name AS student_name, sp.student_id,
                tp.package_name,
                t.name AS teacher_name, b.teacher_id,
                CASE WHEN cr.id IS NOT NULL THEN TRUE ELSE FALSE END AS has_report
            FROM bookings b
            JOIN student_packages sp ON b.student_package_id = sp.id
            JOIN users u ON sp.student_id = u.id
            JOIN tutorial_packages tp ON sp.package_id = tp.id
            LEFT JOIN users t ON b.teacher_id = t.id
            LEFT JOIN class_reports cr ON cr.booking_id = b.id
            WHERE b.status = 'done' AND b.company_id = ?
            ORDER BY b.appointment_date DESC
            LIMIT ? OFFSET ?
        `, [companyId, limit, offset]);

        const [[{ total }]] = await pool.query(
            "SELECT COUNT(*) AS total FROM bookings WHERE status = 'done' AND company_id = ?",
            [companyId]
        );

        res.json({ data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    } catch (err) {
        console.error("Error fetching completed bookings:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// Get subject for a student package (students can only view their own)
router.get("/api/student-package/:id", authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.user.company_id;
        const userId = req.user.id;
        const role = req.user.role;

        let query = "SELECT subject FROM student_packages WHERE id = ? AND company_id = ?";
        const params = [id, companyId];

        // Students can only view their own packages
        if (role === 'student') {
            query += " AND student_id = ?";
            params.push(userId);
        }

        const [rows] = await pool.query(query, params);
        if (rows.length === 0) return res.status(404).json({ message: "Student package not found" });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

// Cancel a booking (student cancels — respects company cancellation window)
router.delete("/api/bookings/:id", authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.user.company_id;
        const studentId = req.user.id;

        const [[booking]] = await pool.query(
            `SELECT b.*, sp.student_id
             FROM bookings b JOIN student_packages sp ON b.student_package_id = sp.id
             WHERE b.id = ? AND b.company_id = ?`,
            [id, companyId]
        );
        if (!booking) return res.status(404).json({ message: "Booking not found" });

        // Check cancellation window
        const [[company]] = await pool.query(
            'SELECT cancellation_hours FROM companies WHERE id = ?', [companyId]
        );
        const cancellationHours = company?.cancellation_hours ?? 1;
        const appointmentTime = new Date(booking.appointment_date).getTime();
        const now = Date.now();
        const hoursUntilClass = (appointmentTime - now) / (1000 * 60 * 60);

        if (cancellationHours > 0 && hoursUntilClass < cancellationHours) {
            // Within window — notify teacher but do NOT cancel
            const [[student]] = await pool.query('SELECT name FROM users WHERE id = ?', [studentId]);
            const dateStr = new Date(booking.appointment_date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
            if (booking.teacher_id) {
                await notify({
                    userId: booking.teacher_id, companyId,
                    type: 'booking_cancelled',
                    title: 'Student attempted to cancel',
                    message: `${student?.name || 'A student'} tried to cancel their session on ${dateStr}. Class proceeds as scheduled.`,
                });
            }
            return res.status(403).json({
                within_window: true,
                cancellation_hours: cancellationHours,
                message: `Cancellation is not allowed within ${cancellationHours} hour(s) of the scheduled class time.`,
            });
        }

        // Only allow cancelling active bookings (not already done or cancelled)
        if (booking.status === 'done' || booking.status === 'cancelled') {
            return res.status(400).json({ message: "This booking is already completed or cancelled." });
        }

        // Group-aware cancellation: if booking is part of a multi-slot group, cancel all slots
        if (booking.booking_group_id) {
            await pool.query(
                "DELETE FROM bookings WHERE booking_group_id = ? AND company_id = ?",
                [booking.booking_group_id, companyId]
            );
        } else {
            const [result] = await pool.query(
                "DELETE FROM bookings WHERE id = ? AND company_id = ?", [id, companyId]
            );
            if (result.affectedRows === 0) return res.status(404).json({ message: "Booking not found" });
        }

        // Refund 1 session — one class = one session regardless of slot count
        await pool.query(
            `UPDATE student_packages SET sessions_remaining = sessions_remaining + 1
             WHERE id = ? AND company_id = ?`,
            [booking.student_package_id, companyId]
        );

        const [[student]] = await pool.query('SELECT name FROM users WHERE id = ?', [studentId]);
        const dateStr = new Date(booking.appointment_date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

        if (booking.teacher_id) {
            await notify({
                userId: booking.teacher_id, companyId,
                type: 'booking_cancelled',
                title: 'Class cancelled by student',
                message: `${student?.name || 'A student'} cancelled their session on ${dateStr}.`,
            });
        }

        const [admins] = await pool.query(
            "SELECT id FROM users WHERE company_id = ? AND role = 'company_admin'", [companyId]
        );
        await Promise.all(admins.map(admin => notify({
            userId: admin.id, companyId,
            type: 'booking_cancelled',
            title: 'Booking cancelled',
            message: `${student?.name || 'A student'} cancelled their session on ${dateStr}.`,
        })));

        // Issue #6: Notify waitlisted students when a slot opens
        if (booking.teacher_id) {
            notifyWaitlistForSlot(companyId, booking.teacher_id, booking.appointment_date);
        }

        res.json({ message: "Booking canceled successfully" });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

// Mark class as done + deduct session (wrapped in transaction to prevent race conditions)
router.post("/api/bookings/done/:id", authenticateToken, requireRole('company_admin'), async (req, res) => {
    const { id } = req.params;
    const { student_package_id } = req.body;
    const companyId = req.user.company_id;

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Idempotency: check if booking is already done
        const [[thisBooking]] = await connection.query(
            "SELECT booking_group_id, status FROM bookings WHERE id = ? AND company_id = ?",
            [id, companyId]
        );
        if (!thisBooking) {
            await connection.rollback();
            return res.status(404).json({ message: "Booking not found" });
        }
        if (thisBooking.status === 'done') {
            await connection.rollback();
            return res.status(400).json({ message: "This class is already marked as done." });
        }

        // Mark booking(s) as done — sessions were already deducted at booking time
        if (thisBooking.booking_group_id) {
            await connection.query(
                "UPDATE bookings SET status = 'done' WHERE booking_group_id = ? AND company_id = ? AND status NOT IN ('done', 'cancelled')",
                [thisBooking.booking_group_id, companyId]
            );
        } else {
            await connection.query(
                "UPDATE bookings SET status = 'done' WHERE id = ? AND company_id = ?",
                [id, companyId]
            );
        }

        await connection.commit();

        // Notify teacher to submit report
        const [[booking]] = await pool.query(
            `SELECT b.teacher_id, u.name AS student_name
             FROM bookings b
             JOIN student_packages sp ON b.student_package_id = sp.id
             JOIN users u ON sp.student_id = u.id
             WHERE b.id = ? AND b.company_id = ?`,
            [id, companyId]
        );
        if (booking?.teacher_id) {
            await notify({
                userId: booking.teacher_id, companyId,
                type: 'report_due',
                title: 'Class completed — report required',
                message: `Please submit your class report for ${booking.student_name}.`,
            });
        }

        // Low-session notification — warn student and admin when sessions_remaining <= 2
        const [[updatedPkg]] = await pool.query(
            `SELECT sp.sessions_remaining, sp.student_id, u.name AS student_name
             FROM student_packages sp JOIN users u ON sp.student_id = u.id
             WHERE sp.id = ?`, [student_package_id]
        );
        if (updatedPkg && updatedPkg.sessions_remaining <= 2 && updatedPkg.sessions_remaining > 0) {
            await notify({
                userId: updatedPkg.student_id, companyId,
                type: 'low_sessions',
                title: 'Low sessions remaining',
                message: `You have ${updatedPkg.sessions_remaining} session(s) left in your current package. Please consider enrolling in a new package soon.`,
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
                message: 'You have used all your sessions. Please enroll in a new package to continue booking classes.',
            });
        }

        await logAction(companyId, req.user.id, 'booking_done', 'booking', id, { student_package_id });
        res.json({ message: "Class marked as done!" });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ message: "Server error" });
    } finally {
        connection.release();
    }
});

// Cancel a class (admin cancels — notify student + teacher)
router.post("/api/bookings/cancel/:id", authenticateToken, requireRole('company_admin'), async (req, res) => {
    const { id } = req.params;
    const companyId = req.user.company_id;

    try {
        const [[booking]] = await pool.query(
            `SELECT b.*, sp.student_id, u.name AS student_name
             FROM bookings b
             JOIN student_packages sp ON b.student_package_id = sp.id
             JOIN users u ON sp.student_id = u.id
             WHERE b.id = ? AND b.company_id = ?`,
            [id, companyId]
        );

        // Only refund if booking is still active
        if (booking && booking.status !== 'done' && booking.status !== 'cancelled') {
            // Group-aware: cancel all slots in the group
            if (booking.booking_group_id) {
                await pool.query(
                    "UPDATE bookings SET status = 'cancelled' WHERE booking_group_id = ? AND company_id = ? AND status NOT IN ('done', 'cancelled')",
                    [booking.booking_group_id, companyId]
                );
            } else {
                await pool.query(
                    "UPDATE bookings SET status = 'cancelled' WHERE id = ? AND company_id = ?",
                    [id, companyId]
                );
            }
            // Refund 1 session — one class = one session regardless of slot count
            await pool.query(
                `UPDATE student_packages SET sessions_remaining = sessions_remaining + 1
                 WHERE id = ? AND company_id = ?`,
                [booking.student_package_id, companyId]
            );
        } else {
            await pool.query(
                "UPDATE bookings SET status = 'cancelled' WHERE id = ? AND company_id = ?",
                [id, companyId]
            );
        }

        if (booking) {
            const dateStr = new Date(booking.appointment_date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

            if (booking.student_id) {
                await notify({
                    userId: booking.student_id, companyId,
                    type: 'class_cancelled',
                    title: 'Class cancelled',
                    message: `Your class on ${dateStr} was cancelled by the admin.`,
                });
            }
            if (booking.teacher_id) {
                await notify({
                    userId: booking.teacher_id, companyId,
                    type: 'booking_cancelled',
                    title: 'Class cancelled',
                    message: `The class with ${booking.student_name} on ${dateStr} was cancelled.`,
                });
            }
        }

        // Issue #6: Notify waitlisted students
        if (booking && booking.teacher_id) {
            notifyWaitlistForSlot(companyId, booking.teacher_id, booking.appointment_date);
        }

        res.json({ message: "Class cancelled!" });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;
