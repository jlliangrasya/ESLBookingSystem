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
                    sp.sessions_remaining, tp.session_limit
             FROM student_packages sp
             JOIN tutorial_packages tp ON sp.package_id = tp.id
             WHERE sp.student_id = ? AND sp.company_id = ? AND sp.payment_status = 'paid' AND sp.sessions_remaining > 0
             ORDER BY sp.purchased_at DESC LIMIT 1`,
            [userId, companyId]
        );
        const packageDetails = packageRows.length > 0 ? packageRows[0] : null;

        let bookings = [];
        // Fetch bookings from ALL student packages for this student
        const [bookingRows] = await pool.query(
            `SELECT b.id, b.appointment_date, b.status, b.class_mode, b.meeting_link,
                    b.teacher_absent, b.student_absent,
                    u.name AS teacher_name
             FROM bookings b
             JOIN student_packages sp ON b.student_package_id = sp.id
             LEFT JOIN users u ON b.teacher_id = u.id
             WHERE sp.student_id = ? AND sp.company_id = ?
               AND DATE(b.appointment_date) >= CURDATE()
               AND b.status NOT IN ('done', 'cancelled')`,
            [userId, companyId]
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
            `SELECT b.id, b.teacher_absent, b.student_package_id FROM bookings b
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

        // Refund 1 session to the student's package
        await pool.query(
            'UPDATE student_packages SET sessions_remaining = sessions_remaining + 1 WHERE id = ? AND company_id = ?',
            [booking.student_package_id, req.user.company_id]
        );

        // Notify all company admins (fire-and-forget)
        ;(async () => {
            const [[fullBooking]] = await pool.query(
                `SELECT b.appointment_date, u_student.name AS student_name, u_teacher.name AS teacher_name
                 FROM bookings b
                 JOIN student_packages sp ON b.student_package_id = sp.id
                 JOIN users u_student ON sp.student_id = u_student.id
                 LEFT JOIN users u_teacher ON b.teacher_id = u_teacher.id
                 WHERE b.id = ?`,
                [id]
            );
            const [admins] = await pool.query(
                "SELECT id FROM users WHERE company_id = ? AND role = 'company_admin' AND is_active = TRUE",
                [req.user.company_id]
            );
            for (const admin of admins) {
                await notify({
                    userId: admin.id, companyId: req.user.company_id,
                    type: 'general',
                    title: 'Teacher no-show reported',
                    message: `${fullBooking?.student_name || 'A student'}'s class on ${fullBooking?.appointment_date ? new Date(fullBooking.appointment_date).toLocaleString() : 'unknown date'} was marked as teacher no-show. 1 session has been refunded.`,
                });
            }
        })();

        res.json({ message: 'Teacher marked as absent. 1 session has been refunded to your package.' });
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

        // Find the teacher assigned to the student's active paid package
        const [[pkg]] = await pool.query(
            `SELECT teacher_id FROM student_packages
             WHERE student_id = ? AND company_id = ? AND payment_status = 'paid' AND sessions_remaining > 0
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

// Get teacher slot statuses for a date (open, booked, your-class)
router.get('/teacher-slots', authenticateToken, requireRole('student'), async (req, res) => {
    try {
        const studentId = req.user.id;
        const companyId = req.user.company_id;
        const { teacher_id, date } = req.query;
        if (!date) return res.status(400).json({ message: 'date is required' });

        let openSlots = [];
        if (teacher_id) {
            // Get open slots for specific teacher
            const [rows] = await pool.query(
                `SELECT TIME_FORMAT(slot_time, '%H:%i') AS slot_time
                 FROM teacher_available_slots
                 WHERE company_id = ? AND teacher_id = ? AND slot_date = ?`,
                [companyId, teacher_id, date]
            );
            openSlots = rows.map(r => r.slot_time);
        } else {
            // No specific teacher — general schedule: only show slots where ≥1 teacher is truly free
            const [slotRows] = await pool.query(
                `SELECT teacher_id, TIME_FORMAT(slot_time, '%H:%i') AS slot_time
                 FROM teacher_available_slots
                 WHERE company_id = ? AND slot_date = ?`,
                [companyId, date]
            );

            if (slotRows.length === 0) {
                openSlots = [];
            } else {
                const allTeacherIds = [...new Set(slotRows.map(r => r.teacher_id))];
                const placeholders = allTeacherIds.map(() => '?').join(',');

                // Teachers on leave this date
                const [leaveRows] = await pool.query(
                    `SELECT teacher_id FROM teacher_leaves
                     WHERE company_id = ? AND leave_date = ? AND status IN ('pending','approved')
                       AND teacher_id IN (${placeholders})`,
                    [companyId, date, ...allTeacherIds]
                );
                const leaveSet = new Set(leaveRows.map(r => r.teacher_id));

                // All bookings for these teachers on this date (any student)
                const dateStart0 = `${date} 00:00:00`;
                const dateEnd0 = `${date} 23:59:59`;
                const [teacherBookings] = await pool.query(
                    `SELECT teacher_id, TIME_FORMAT(appointment_date, '%H:%i') AS slot_time
                     FROM bookings
                     WHERE company_id = ? AND teacher_id IN (${placeholders})
                       AND appointment_date BETWEEN ? AND ? AND status NOT IN ('cancelled')`,
                    [companyId, ...allTeacherIds, dateStart0, dateEnd0]
                );
                // Map: teacher_id → Set of booked slot_times
                const bookedByTeacher = {};
                for (const tb of teacherBookings) {
                    if (!bookedByTeacher[tb.teacher_id]) bookedByTeacher[tb.teacher_id] = new Set();
                    bookedByTeacher[tb.teacher_id].add(tb.slot_time);
                }

                // A slot is available if ≥1 teacher is: not on leave + has no booking at that time
                const availableSlots = new Set();
                for (const { teacher_id: tid, slot_time } of slotRows) {
                    if (leaveSet.has(tid)) continue;
                    if (bookedByTeacher[tid]?.has(slot_time)) continue;
                    availableSlots.add(slot_time);
                }
                openSlots = [...availableSlots].sort();
            }
        }

        // Get bookings relevant to the booked_map
        let bookedQuery, bookedParams;
        const dateStart = `${date} 00:00:00`;
        const dateEnd = `${date} 23:59:59`;
        if (teacher_id) {
            // Specific teacher: show both the student's class and other students booked with this teacher
            bookedQuery = `SELECT b.id, b.appointment_date, sp.student_id
                FROM bookings b JOIN student_packages sp ON b.student_package_id = sp.id
                WHERE b.company_id = ? AND b.teacher_id = ? AND b.appointment_date BETWEEN ? AND ?
                AND b.status NOT IN ('cancelled')`;
            bookedParams = [companyId, teacher_id, dateStart, dateEnd];
        } else {
            // General schedule: only show the current student's own bookings ("your_class")
            // Slot unavailability for other students is already handled by open_slots above
            bookedQuery = `SELECT b.id, b.appointment_date, sp.student_id
                FROM bookings b JOIN student_packages sp ON b.student_package_id = sp.id
                WHERE b.company_id = ? AND sp.student_id = ? AND b.appointment_date BETWEEN ? AND ?
                AND b.status NOT IN ('cancelled')`;
            bookedParams = [companyId, studentId, dateStart, dateEnd];
        }
        const [bookingRows] = await pool.query(bookedQuery, bookedParams);

        // Build booked map: { "09:00": "booked" | "your_class" }
        // appointment_date is stored in UTC. Extract hours directly from the stored string
        // since MySQL2 may apply timezone offset with Date objects.
        const bookedMap = {};
        for (const b of bookingRows) {
            const raw = String(b.appointment_date);
            const timeMatch = raw.match(/(\d{2}):(\d{2}):\d{2}/);
            const timeKey = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : '00:00';
            bookedMap[timeKey] = b.student_id === studentId ? 'your_class' : 'booked';
        }

        res.json({ open_slots: openSlots, booked_map: bookedMap });
    } catch (err) {
        console.error("Error fetching teacher slots:", err);
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

// Get teachers available at a specific date+time (for student teacher picker)
// Uses opt-in model: teacher must have ALL consecutive slots OPEN in teacher_available_slots
router.get('/available-teachers', authenticateToken, requireRole('student'), async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const { date, time, duration_minutes } = req.query;
        if (!date || !time) return res.status(400).json({ message: 'date and time are required' });

        const durationMins = Math.max(30, parseInt(duration_minutes) || 30);
        const slotsNeeded = Math.ceil(durationMins / 30);

        // Convert time to 24h format for matching
        const match = time.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)?$/i);
        let time24;
        if (match && match[3]) {
            let hr = parseInt(match[1]);
            if (match[3].toUpperCase() === 'PM' && hr !== 12) hr += 12;
            if (match[3].toUpperCase() === 'AM' && hr === 12) hr = 0;
            time24 = `${String(hr).padStart(2, '0')}:${match[2]}`;
        } else {
            time24 = time.substring(0, 5);
        }

        // Compute all consecutive slot times needed
        const [startH, startM] = time24.split(':').map(Number);
        const slotTimes = [];
        for (let i = 0; i < slotsNeeded; i++) {
            const totalMins = startH * 60 + startM + i * 30;
            const h = Math.floor(totalMins / 60);
            const m = totalMins % 60;
            slotTimes.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        }

        // Teachers who have the FIRST slot open
        const [firstSlotTeachers] = await pool.query(
            `SELECT teacher_id FROM teacher_available_slots WHERE company_id = ? AND slot_date = ? AND TIME_FORMAT(slot_time, '%H:%i') = ?`,
            [companyId, date, slotTimes[0]]
        );
        if (firstSlotTeachers.length === 0) return res.json([]);

        const candidateIds = firstSlotTeachers.map(r => r.teacher_id);

        // For multi-slot bookings, verify ALL consecutive slots are open per teacher
        let validIds = candidateIds;
        if (slotsNeeded > 1) {
            const [allSlots] = await pool.query(
                `SELECT teacher_id, TIME_FORMAT(slot_time, '%H:%i') AS slot_time_fmt
                 FROM teacher_available_slots
                 WHERE company_id = ? AND slot_date = ?
                   AND TIME_FORMAT(slot_time, '%H:%i') IN (${slotTimes.map(() => '?').join(',')})
                   AND teacher_id IN (${candidateIds.map(() => '?').join(',')})`,
                [companyId, date, ...slotTimes, ...candidateIds]
            );
            // Group slots by teacher
            const teacherSlotMap = {};
            for (const row of allSlots) {
                if (!teacherSlotMap[row.teacher_id]) teacherSlotMap[row.teacher_id] = new Set();
                teacherSlotMap[row.teacher_id].add(row.slot_time_fmt);
            }
            // Only keep teachers that have ALL required slots open
            validIds = candidateIds.filter(tid =>
                teacherSlotMap[tid] && slotTimes.every(st => teacherSlotMap[tid].has(st))
            );
            if (validIds.length === 0) return res.json([]);
        }

        // Get teacher names
        const [teachers] = await pool.query(
            `SELECT id, name FROM users WHERE id IN (${validIds.map(() => '?').join(',')}) AND is_active = TRUE`,
            validIds
        );

        // Exclude teachers on leave
        const [onLeave] = await pool.query(
            `SELECT teacher_id FROM teacher_leaves WHERE company_id = ? AND leave_date = ? AND status IN ('pending','approved') AND teacher_id IN (${validIds.map(() => '?').join(',')})`,
            [companyId, date, ...validIds]
        );
        const leaveIds = new Set(onLeave.map(r => r.teacher_id));

        // Exclude teachers with any booking conflicting with any of the consecutive slots
        const conflictDatetimes = slotTimes.map(st => `${date} ${st}:00`);
        const [booked] = await pool.query(
            `SELECT DISTINCT teacher_id FROM bookings
             WHERE company_id = ? AND status NOT IN ('cancelled','done')
               AND appointment_date IN (${conflictDatetimes.map(() => '?').join(',')})
               AND teacher_id IN (${validIds.map(() => '?').join(',')})`,
            [companyId, ...conflictDatetimes, ...validIds]
        );
        const bookedIds = new Set(booked.map(r => r.teacher_id));

        const available = teachers.filter(t => !leaveIds.has(t.id) && !bookedIds.has(t.id));
        res.json(available);
    } catch (err) {
        console.error("Error fetching available teachers:", err);
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
                sp.sessions_remaining,
                sp.teacher_id,
                t.name AS teacher_name,
                CASE WHEN sp.payment_status = 'paid' AND sp.sessions_remaining > 0 THEN TRUE ELSE FALSE END AS enrolled
            FROM users u
            LEFT JOIN (
                SELECT sp2.*, ROW_NUMBER() OVER (PARTITION BY sp2.student_id ORDER BY
                    CASE WHEN sp2.payment_status = 'paid' AND sp2.sessions_remaining > 0 THEN 0 ELSE 1 END,
                    sp2.purchased_at DESC) AS rn
                FROM student_packages sp2 WHERE sp2.company_id = ?
            ) sp ON u.id = sp.student_id AND sp.rn = 1
            LEFT JOIN tutorial_packages tp ON sp.package_id = tp.id
            LEFT JOIN users t ON t.id = sp.teacher_id
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
                   sp.sessions_remaining
            FROM student_packages sp
            JOIN users u ON sp.student_id = u.id
            JOIN tutorial_packages tp ON sp.package_id = tp.id
            WHERE sp.payment_status = 'unpaid' AND sp.company_id = ?
              AND sp.sessions_remaining > 0
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
                   sp.sessions_remaining
            FROM student_packages sp
            JOIN users u ON sp.student_id = u.id
            JOIN tutorial_packages tp ON sp.package_id = tp.id
            WHERE sp.payment_status = 'paid' AND sp.company_id = ?
              AND sp.sessions_remaining > 0
            ORDER BY sp.purchased_at DESC
        `, [companyId]);
        res.json(rows);
    } catch (err) {
        console.error("Error fetching paid packages:", err);
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;
