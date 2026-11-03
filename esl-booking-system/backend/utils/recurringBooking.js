const crypto = require('crypto');
const { attendeeSql, canUsePackage } = require('./sharedPackages');

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Advance a "YYYY-MM-DD" string by one day using pure arithmetic — no Date object,
 * no timezone shift risk.
 */
function addOneDay(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + 1));
    return dt.toISOString().slice(0, 10);
}

/** Add N days to a "YYYY-MM-DD" string. */
function addDays(dateStr, n) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return dt.toISOString().slice(0, 10);
}

/** Get the day-of-week index (0=Sun) for a "YYYY-MM-DD" string. */
function dayOfWeek(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Compare two "YYYY-MM-DD" strings. */
function dateStrLt(a, b) { return a < b; }

/**
 * Create one recurring schedule and its bookings, deducting 1 session per class.
 * Runs inside the caller's transaction on `connection` — the caller begins,
 * commits/rolls back and releases. Because it shares the transaction, several
 * calls in a row see each other's bookings and deductions.
 *
 * Returns { error: { status, code, body } } when nothing should be booked, or
 * the created schedule's details.
 */
async function bookRecurringSchedule(connection, {
    companyId, actorRole, actorId, studentPackageId, studentId, teacherId: requestedTeacherId,
    daysOfWeek, startTime, numWeeks, startDate,
}) {
    const fail = (status, code, body) => ({ error: { status, code, body } });
    const weeksCount = Math.min(12, Math.max(1, parseInt(numWeeks) || 4));

    // ── Lock & fetch package + duration ─────────────────────────────────
    const [spRows] = await connection.query(
        `SELECT sp.id, sp.student_id, sp.teacher_id, sp.sessions_remaining, sp.payment_status,
                tp.duration_minutes
         FROM student_packages sp
         JOIN tutorial_packages tp ON sp.package_id = tp.id
         WHERE sp.id = ? AND sp.company_id = ? FOR UPDATE`,
        [studentPackageId, companyId]
    );
    if (spRows.length === 0) return fail(404, 'PACKAGE_NOT_FOUND', { message: 'Student package not found' });
    const sp = spRows[0];

    // Who attends: the student themself, or (admin) the chosen student on a
    // shared package — defaulting to the package owner as before.
    const attendeeId = actorRole === 'student'
        ? actorId
        : (studentId ? Number(studentId) : sp.student_id);

    // Students can only create schedules for their own (or shared-with-them) packages
    if (!(await canUsePackage(attendeeId, studentPackageId, connection))) {
        return fail(403, 'NOT_ALLOWED', { message: actorRole === 'student'
            ? 'You can only create recurring schedules for your own packages.'
            : 'That student does not share this package.' });
    }

    if (sp.payment_status !== 'paid') {
        return fail(403, 'NOT_PAID', { message: 'Package payment has not been confirmed yet.' });
    }
    if (sp.sessions_remaining <= 0) {
        return fail(403, 'NOT_ENOUGH_SESSIONS', { message: 'No sessions remaining in this package.' });
    }

    // ── Resolve teacher ─────────────────────────────────────────────────
    let teacherId = requestedTeacherId || sp.teacher_id;
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
        return fail(400, 'NO_TEACHER', { message: 'No teacher assigned. Please assign a teacher to the package or specify teacher_id.' });
    }

    // Verify teacher exists and is active
    const [[validTeacher]] = await connection.query(
        "SELECT id FROM users WHERE id = ? AND company_id = ? AND role = 'teacher' AND is_active = TRUE",
        [teacherId, companyId]
    );
    if (!validTeacher) {
        return fail(400, 'INVALID_TEACHER', { message: 'Selected teacher is not valid.' });
    }

    // ── Calculate duration & slots per class ────────────────────────────
    const durationMinutes = sp.duration_minutes || 25;
    const slotsPerClass = Math.max(1, Math.ceil(durationMinutes / 30));

    // ── Generate target dates ───────────────────────────────────────────
    // Use pure string-based date arithmetic — no new Date() to avoid UTC shift.
    const schedStartStr = startDate || addOneDay(new Date().toISOString().slice(0, 10));
    const schedEndStr = addDays(schedStartStr, weeksCount * 7);

    const [baseH, baseM] = startTime.split(':').map(Number);

    const targetDates = [];
    for (let cur = schedStartStr; dateStrLt(cur, schedEndStr); cur = addOneDay(cur)) {
        const dayName = DAY_NAMES[dayOfWeek(cur)];
        if (!daysOfWeek.includes(dayName)) continue;
        targetDates.push(cur);
    }

    if (targetDates.length === 0) {
        return fail(400, 'NO_MATCHING_DATES', { message: 'No matching dates found for the selected days and weeks.' });
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
                skipReason = `Class extends past end of day at ${startTime}`;
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
                // TEMP DIAGNOSTIC — remove once root cause of the false-negative is confirmed.
                const [allRowsThatDay] = await connection.query(
                    `SELECT teacher_id, slot_date, TIME_FORMAT(slot_time, '%H:%i:%s') AS slot_time_raw
                     FROM teacher_available_slots WHERE company_id = ? AND slot_date = ?`,
                    [companyId, dateStr]
                );
                console.log('[recurring debug] no match', {
                    companyId, teacherId, teacherIdType: typeof teacherId, dateStr, timeStr,
                    rowsThatDayAnyTeacher: allRowsThatDay,
                });
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
                 WHERE ${attendeeSql('b', 'spp')} = ? AND b.company_id = ? AND b.status NOT IN ('cancelled', 'done')
                 AND ABS(TIMESTAMPDIFF(MINUTE, b.appointment_date, ?)) < 30`,
                [attendeeId, companyId, slotDatetime]
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
        return fail(400, 'NO_AVAILABLE_DATES', {
            message: 'No available dates found. All dates have conflicts.',
            skipped_dates: skippedDates,
        });
    }

    if (sp.sessions_remaining < bookableDates.length) {
        return fail(403, 'NOT_ENOUGH_SESSIONS', {
            message: `Not enough sessions: ${sp.sessions_remaining} remaining, ${bookableDates.length} needed.`,
            sessions_remaining: sp.sessions_remaining,
            sessions_needed: bookableDates.length,
            skipped_dates: skippedDates,
        });
    }

    // ── INSERT recurring schedule ───────────────────────────────────────
    const [schedResult] = await connection.query(
        `INSERT INTO recurring_schedules
         (company_id, student_package_id, teacher_id, student_id, days_of_week, start_time,
          duration_minutes, slots_per_class, num_weeks, start_date, end_date,
          total_possible, sessions_booked, skipped_dates, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        [companyId, studentPackageId, teacherId, attendeeId,
         JSON.stringify(daysOfWeek), startTime,
         durationMinutes, slotsPerClass, weeksCount, schedStartStr, schedEndStr,
         targetDates.length, bookableDates.length,
         skippedDates.length > 0 ? JSON.stringify(skippedDates) : null,
         actorId]
    );
    const scheduleId = schedResult.insertId;

    // ── INSERT bookings for each bookable date ──────────────────────────
    const bookingIds = [];
    for (const { date, slots } of bookableDates) {
        // Each CLASS gets its own booking_group_id for multi-slot
        const groupId = slotsPerClass > 1 ? crypto.randomUUID() : null;

        for (const timeStr of slots) {
            const appointmentDate = `${date} ${timeStr}:00`;
            const [result] = await connection.query(
                `INSERT INTO bookings (company_id, student_package_id, attendee_id, teacher_id, appointment_date,
                 status, rescheduled_by_admin, booking_group_id, recurring_schedule_id, created_at)
                 VALUES (?, ?, ?, ?, ?, 'confirmed', 0, ?, ?, NOW())`,
                [companyId, studentPackageId, attendeeId, teacherId, appointmentDate, groupId, scheduleId]
            );
            bookingIds.push(result.insertId);
        }
    }

    // ── Deduct sessions (1 per CLASS, not per slot) ─────────────────────
    await connection.query(
        `UPDATE student_packages SET sessions_remaining = GREATEST(0, sessions_remaining - ?)
         WHERE id = ? AND company_id = ?`,
        [bookableDates.length, studentPackageId, companyId]
    );

    return {
        scheduleId,
        attendeeId,
        teacherId,
        weeksCount,
        sessionsBooked: bookableDates.length,
        sessionsRemaining: sp.sessions_remaining - bookableDates.length,
        skippedDates,
        totalPossible: targetDates.length,
        bookingIds,
        durationMinutes,
        slotsPerClass,
    };
}

module.exports = { DAY_NAMES, addDays, dayOfWeek, bookRecurringSchedule };
