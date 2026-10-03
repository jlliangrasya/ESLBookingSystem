const pool = require('../db');

/**
 * Who can teach a class at a given date + time.
 *
 * Shared by the student teacher picker and the admin substitute finder so the
 * two never disagree about who is free.
 */

/** Accepts "7:00 PM", "19:00" or "19:00:00" and returns "HH:mm". */
function toTime24(time) {
    const match = String(time).match(/^(\d{1,2}):(\d{2})\s?(AM|PM)?$/i);
    if (match && match[3]) {
        let hr = parseInt(match[1]);
        if (match[3].toUpperCase() === 'PM' && hr !== 12) hr += 12;
        if (match[3].toUpperCase() === 'AM' && hr === 12) hr = 0;
        return `${String(hr).padStart(2, '0')}:${match[2]}`;
    }
    return String(time).substring(0, 5);
}

/** The consecutive 30-min slot times ("HH:mm") a class of `durationMins` occupies. */
function consecutiveSlotTimes(time24, durationMins) {
    const slotsNeeded = Math.ceil(Math.max(30, durationMins) / 30);
    const [startH, startM] = time24.split(':').map(Number);
    const slotTimes = [];
    for (let i = 0; i < slotsNeeded; i++) {
        const totalMins = startH * 60 + startM + i * 30;
        slotTimes.push(`${String(Math.floor(totalMins / 60)).padStart(2, '0')}:${String(totalMins % 60).padStart(2, '0')}`);
    }
    return slotTimes;
}

/**
 * Active teachers who are free for every slot of the class: not on leave that
 * day and with no other live booking in any of the slots.
 *
 * `open`          — also have ALL the slots open in teacher_available_slots.
 * `freeButClosed` — free, but haven't opened every slot (only when includeClosed).
 */
async function findAvailableTeachers({ companyId, date, time24, durationMins, excludeTeacherId = null, includeClosed = false }) {
    const slotTimes = consecutiveSlotTimes(time24, durationMins);

    const [teachers] = await pool.query(
        `SELECT id, name FROM users
         WHERE company_id = ? AND role = 'teacher' AND is_active = TRUE ${excludeTeacherId ? 'AND id <> ?' : ''}
         ORDER BY name ASC`,
        excludeTeacherId ? [companyId, excludeTeacherId] : [companyId]
    );
    if (teachers.length === 0) return { open: [], freeButClosed: [] };
    const ids = teachers.map(t => t.id);
    const idList = ids.map(() => '?').join(',');

    const [onLeave] = await pool.query(
        `SELECT teacher_id FROM teacher_leaves WHERE company_id = ? AND leave_date = ? AND status IN ('pending','approved') AND teacher_id IN (${idList})`,
        [companyId, date, ...ids]
    );
    const leaveIds = new Set(onLeave.map(r => r.teacher_id));

    const conflictDatetimes = slotTimes.map(st => `${date} ${st}:00`);
    const [booked] = await pool.query(
        `SELECT DISTINCT teacher_id FROM bookings
         WHERE company_id = ? AND status NOT IN ('cancelled','done')
           AND appointment_date IN (${conflictDatetimes.map(() => '?').join(',')})
           AND teacher_id IN (${idList})`,
        [companyId, ...conflictDatetimes, ...ids]
    );
    const bookedIds = new Set(booked.map(r => r.teacher_id));

    const [openRows] = await pool.query(
        `SELECT teacher_id, TIME_FORMAT(slot_time, '%H:%i') AS slot_time_fmt
         FROM teacher_available_slots
         WHERE company_id = ? AND slot_date = ?
           AND TIME_FORMAT(slot_time, '%H:%i') IN (${slotTimes.map(() => '?').join(',')})
           AND teacher_id IN (${idList})`,
        [companyId, date, ...slotTimes, ...ids]
    );
    const openByTeacher = {};
    for (const row of openRows) {
        (openByTeacher[row.teacher_id] ||= new Set()).add(row.slot_time_fmt);
    }

    const open = [];
    const freeButClosed = [];
    for (const t of teachers) {
        if (leaveIds.has(t.id) || bookedIds.has(t.id)) continue;
        const opened = openByTeacher[t.id];
        if (opened && slotTimes.every(st => opened.has(st))) open.push(t);
        else if (includeClosed) freeButClosed.push(t);
    }
    return { open, freeButClosed };
}

module.exports = { toTime24, consecutiveSlotTimes, findAvailableTeachers };
