const pool = require('../db');
const { bookRecurringSchedule, DAY_NAMES, addDays, dayOfWeek } = require('./recurringBooking');

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const dayOrderSql = (col) => `FIELD(${col}, ${DAYS_OF_WEEK.map(() => '?').join(', ')})`;

// Agreed regular schedules (a record only — never used to book or deduct),
// grouped by student id and sorted Monday-first, then by time.
// Pass studentId to load a single student.
async function loadRegularSchedules(companyId, studentId = null) {
  const params = [companyId];
  let studentClause = '';
  if (studentId !== null) {
    studentClause = 'AND rs.student_id = ?';
    params.push(studentId);
  }
  const [rows] = await pool.query(
    `SELECT rs.id, rs.student_id, rs.day_of_week, TIME_FORMAT(rs.start_time, '%H:%i') AS start_time,
            rs.teacher_id, t.name AS teacher_name
     FROM student_regular_schedules rs
     LEFT JOIN users t ON t.id = rs.teacher_id
     WHERE rs.company_id = ? ${studentClause}
     ORDER BY ${dayOrderSql('rs.day_of_week')}, rs.start_time`,
    [...params, ...DAYS_OF_WEEK]
  );
  const byStudent = {};
  for (const { student_id, ...entry } of rows) {
    (byStudent[student_id] = byStudent[student_id] || []).push(entry);
  }
  return byStudent;
}

// Every active student's regular-schedule slots with one teacher, with the
// package Apply would book from (own package first, then a shared one).
async function loadTeacherRegularSchedule(companyId, teacherId) {
  const [rows] = await pool.query(
    `SELECT rs.id, rs.student_id, u.name AS student_name, rs.day_of_week,
            TIME_FORMAT(rs.start_time, '%H:%i') AS start_time, rs.teacher_id, t.name AS teacher_name
     FROM student_regular_schedules rs
     JOIN users u ON u.id = rs.student_id AND u.is_active = TRUE
     LEFT JOIN users t ON t.id = rs.teacher_id
     WHERE rs.company_id = ? AND rs.teacher_id = ?
     ORDER BY ${dayOrderSql('rs.day_of_week')}, rs.start_time, u.name`,
    [companyId, teacherId, ...DAYS_OF_WEEK]
  );
  const studentIds = [...new Set(rows.map((r) => r.student_id))];
  const packages = {};
  for (const studentId of studentIds) {
    packages[studentId] = await findBookablePackage(companyId, studentId);
  }
  return rows.map((r) => ({
    ...r,
    student_package_id: packages[r.student_id]?.id ?? null,
    sessions_remaining: packages[r.student_id]?.sessions_remaining ?? 0,
    duration_minutes: packages[r.student_id]?.duration_minutes ?? null,
  }));
}

// The paid package with sessions left that a student's classes book from:
// their own first, then one shared with them, newest first.
async function findBookablePackage(companyId, studentId, db = pool) {
  const [[pkg]] = await db.query(
    `SELECT sp.id, sp.sessions_remaining, tp.duration_minutes
     FROM student_packages sp
     JOIN tutorial_packages tp ON tp.id = sp.package_id
     WHERE sp.company_id = ? AND sp.payment_status = 'paid' AND sp.sessions_remaining > 0
       AND (sp.student_id = ? OR sp.id IN (SELECT student_package_id FROM student_package_members WHERE student_id = ?))
     ORDER BY (sp.student_id = ?) DESC, sp.purchased_at DESC
     LIMIT 1`,
    [companyId, studentId, studentId, studentId]
  );
  return pkg || null;
}

const fmt12 = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/**
 * Book one student's regular-schedule entries as real classes for `weeks`
 * weeks, deducting 1 session per class. Runs inside the caller's transaction:
 * on { error } the caller must roll back.
 *
 * When the plan needs more classes than the package has sessions left, the
 * earliest classes are booked up to the sessions available and the rest are
 * reported as skipped ("Not enough sessions left") rather than failing.
 * Slots with no free dates at all are reported as skipped, not as errors.
 */
async function applyRegularEntries(connection, {
  companyId, actorRole, actorId, studentId, studentPackageId, entries, weeks, startDate,
}) {
  // One recurring schedule per teacher + time, covering all its days.
  const groups = new Map();
  for (const e of entries) {
    const key = `${e.teacher_id || ''}|${e.start_time}`;
    if (!groups.has(key)) groups.set(key, { teacherId: e.teacher_id, teacherName: e.teacher_name, time: e.start_time, days: [] });
    groups.get(key).days.push(e.day_of_week);
  }
  const labelOf = (g) => `${g.days.map((d) => d.slice(0, 3)).join('/')} ${fmt12(g.time)}${g.teacherName ? ` with ${g.teacherName}` : ''}`;

  const [[pkg]] = await connection.query(
    'SELECT sessions_remaining FROM student_packages WHERE id = ? AND company_id = ? FOR UPDATE', [studentPackageId, companyId]
  );
  if (!pkg) return { error: { status: 404, message: 'Student package not found' } };
  if (pkg.sessions_remaining <= 0) {
    return { error: { status: 403, message: 'No sessions remaining in this package. Add sessions first. Nothing was booked.' } };
  }

  const base = { companyId, actorRole, actorId, studentPackageId, studentId, numWeeks: weeks, startDate: startDate || null };

  // ── 1. Work out every free date of every slot, booking nothing yet ──
  const plans = [];
  for (const g of groups.values()) {
    const plan = await bookRecurringSchedule(connection, {
      ...base, teacherId: g.teacherId, daysOfWeek: g.days, startTime: g.time, dryRun: true,
    });
    if (plan.error) {
      const { code, status, body } = plan.error;
      if (code === 'NO_AVAILABLE_DATES' || code === 'NO_MATCHING_DATES') {
        plans.push({ g, dates: [], skipped: body.skipped_dates || [] });
        continue;
      }
      return { error: { status, message: `${labelOf(g)}: ${body.message} Nothing was booked.` } };
    }
    plans.push({ g, dates: plan.bookableDates, skipped: plan.skippedDates });
  }

  // ── 2. Keep the earliest classes that the sessions left can pay for ──
  const all = plans.flatMap((p) => p.dates.map((date) => ({ p, date, at: `${date} ${p.g.time}` })));
  all.sort((a, b) => a.at.localeCompare(b.at));
  const planned = all.length;
  const keep = all.slice(0, pkg.sessions_remaining);
  for (const { p, date } of all.slice(pkg.sessions_remaining)) {
    p.skipped.push({ date, reason: 'Not enough sessions left' });
  }
  for (const p of plans) {
    p.chosen = keep.filter((k) => k.p === p).map((k) => k.date);
    p.skipped.sort((a, b) => a.date.localeCompare(b.date));
  }

  // ── 3. Book the chosen dates ──
  const results = [];
  const teacherIds = new Set();
  let totalBooked = 0;
  let sessionsRemaining = pkg.sessions_remaining;
  for (const p of plans) {
    if (p.chosen.length === 0) {
      results.push({ label: labelOf(p.g), sessions_booked: 0, skipped_dates: p.skipped });
      continue;
    }
    const booked = await bookRecurringSchedule(connection, {
      ...base, teacherId: p.g.teacherId, daysOfWeek: p.g.days, startTime: p.g.time, onlyDates: p.chosen,
    });
    if (booked.error) {
      const { code, status, body } = booked.error;
      // Another of this student's slots took the date (e.g. same time, two teachers)
      if (code === 'NO_AVAILABLE_DATES') {
        results.push({ label: labelOf(p.g), sessions_booked: 0, skipped_dates: [...p.skipped, ...(body.skipped_dates || [])] });
        continue;
      }
      return { error: { status, message: `${labelOf(p.g)}: ${body.message} Nothing was booked.` } };
    }
    totalBooked += booked.sessionsBooked;
    sessionsRemaining = booked.sessionsRemaining;
    teacherIds.add(booked.teacherId);
    results.push({ label: labelOf(p.g), sessions_booked: booked.sessionsBooked, skipped_dates: [...p.skipped, ...booked.skippedDates] });
  }

  if (totalBooked === 0) {
    return { error: { status: 400, message: 'No classes could be booked. Every date has a conflict.', groups: results } };
  }
  return {
    totalBooked, sessionsRemaining, groups: results, teacherIds: [...teacherIds],
    // Classes left out only because the package ran out of sessions
    notEnoughSessions: Math.max(0, planned - keep.length),
  };
}

// Teachers' regular weekly OPEN slots (record only), grouped by teacher id,
// e.g. { 7: [{ day_of_week: 'Monday', slot_time: '09:00' }, ...] }.
// Pass teacherId to load a single teacher.
async function loadTeacherRegularSlots(companyId, teacherId = null) {
  const params = [companyId];
  let teacherClause = '';
  if (teacherId !== null) {
    teacherClause = 'AND teacher_id = ?';
    params.push(teacherId);
  }
  const [rows] = await pool.query(
    `SELECT teacher_id, day_of_week, TIME_FORMAT(slot_time, '%H:%i') AS slot_time
     FROM teacher_regular_slots
     WHERE company_id = ? ${teacherClause}
     ORDER BY ${dayOrderSql('day_of_week')}, slot_time`,
    [...params, ...DAYS_OF_WEEK]
  );
  const byTeacher = {};
  for (const { teacher_id, ...slot } of rows) {
    (byTeacher[teacher_id] = byTeacher[teacher_id] || []).push(slot);
  }
  return byTeacher;
}

// Check a student's { entries: [{ day_of_week, start_time: "HH:MM", teacher_id|null }] }
// list from a request. Returns { error } or { clean: [{ day, time, teacherId }] }.
function cleanRegularEntries(entries) {
  if (!Array.isArray(entries)) return { error: 'entries must be a list' };
  if (entries.length > 21) return { error: 'Too many schedule entries' };
  const clean = [];
  for (const e of entries) {
    const day = DAYS_OF_WEEK.find((d) => d.toLowerCase() === String(e?.day_of_week || '').toLowerCase());
    const time = String(e?.start_time || '');
    if (!day) return { error: 'Each entry needs a valid day' };
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { error: 'Each entry needs a valid time' };
    const teacherId = e.teacher_id ? Number(e.teacher_id) : null;
    if (teacherId !== null && !Number.isInteger(teacherId)) return { error: 'Invalid teacher' };
    clean.push({ day, time, teacherId });
  }
  return { clean };
}

// Names of the entries' teachers by id, or null if any isn't a teacher of this company.
async function loadEntryTeachers(db, companyId, clean) {
  const ids = [...new Set(clean.map((e) => e.teacherId).filter((t) => t !== null))];
  if (ids.length === 0) return new Map();
  const [found] = await db.query(
    "SELECT id, name FROM users WHERE id IN (?) AND company_id = ? AND role = 'teacher'", [ids, companyId]
  );
  return found.length === ids.length ? new Map(found.map((t) => [t.id, t.name])) : null;
}

// Replace a student's regular schedule with `clean`, inside the caller's transaction.
async function writeRegularEntries(connection, companyId, studentId, clean) {
  await connection.query('DELETE FROM student_regular_schedules WHERE company_id = ? AND student_id = ?', [companyId, studentId]);
  for (const e of clean) {
    await connection.query(
      'INSERT INTO student_regular_schedules (company_id, student_id, day_of_week, start_time, teacher_id) VALUES (?, ?, ?, ?, ?)',
      [companyId, studentId, e.day, e.time, e.teacherId]
    );
  }
}

// Add one regular slot for a student with a teacher (the Regular Schedule grid,
// admin or teacher). A record only. Returns { error: { status, message } } or
// { label } describing what was added, for the audit log.
async function addTeacherRegularEntry(companyId, teacherId, studentId, dayInput, time) {
  const day = DAYS_OF_WEEK.find((d) => d.toLowerCase() === String(dayInput || '').toLowerCase());
  if (!day) return { error: { status: 400, message: 'Invalid day' } };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time || ''))) return { error: { status: 400, message: 'Invalid time' } };

  const [people] = await pool.query(
    "SELECT id, role, name FROM users WHERE id IN (?, ?) AND company_id = ?", [teacherId, studentId, companyId]
  );
  const teacher = people.find((u) => u.id === teacherId && u.role === 'teacher');
  const student = people.find((u) => u.id === studentId && u.role === 'student');
  if (!teacher) return { error: { status: 404, message: 'Teacher not found' } };
  if (!student) return { error: { status: 404, message: 'Student not found' } };

  const [[dupe]] = await pool.query(
    `SELECT id FROM student_regular_schedules
     WHERE company_id = ? AND student_id = ? AND day_of_week = ? AND start_time = ?`,
    [companyId, studentId, day, `${time}:00`]
  );
  if (dupe) return { error: { status: 400, message: `${student.name} already has a regular slot on ${day} at this time` } };
  const [[{ cnt }]] = await pool.query(
    'SELECT COUNT(*) AS cnt FROM student_regular_schedules WHERE company_id = ? AND student_id = ?', [companyId, studentId]
  );
  if (cnt >= 21) return { error: { status: 400, message: 'Too many schedule entries for this student' } };

  await pool.query(
    'INSERT INTO student_regular_schedules (company_id, student_id, day_of_week, start_time, teacher_id) VALUES (?, ?, ?, ?, ?)',
    [companyId, studentId, day, time, teacherId]
  );
  return { label: `${day} ${time} (${teacher.name})` };
}

// Make the real calendar match a teacher's regular hours for `weeks` weeks from
// startStr: regular open slots are opened and every other slot is CLOSED, so
// the Actual week ends up looking like the Regular one. `regular` is a list of
// [day, "HH:MM"]. Left untouched: days the teacher is on leave (pending or
// approved), slots already in the past, and slots a class is booked in.
async function syncTeacherHours(companyId, teacherId, regular, startStr, weeks) {
  const endStr = addDays(startStr, weeks * 7);
  const isPast = (date, time) => new Date(`${date}T${time}:00+08:00`) < new Date();
  const toTime = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

  const [[leaves], [existing], [bookings]] = await Promise.all([
    pool.query(
      `SELECT DATE_FORMAT(leave_date, '%Y-%m-%d') AS d FROM teacher_leaves
       WHERE teacher_id = ? AND company_id = ? AND status IN ('pending', 'approved') AND leave_date >= ? AND leave_date < ?`,
      [teacherId, companyId, startStr, endStr]
    ),
    pool.query(
      `SELECT DATE_FORMAT(slot_date, '%Y-%m-%d') AS d, TIME_FORMAT(slot_time, '%H:%i') AS t
       FROM teacher_available_slots WHERE company_id = ? AND teacher_id = ? AND slot_date >= ? AND slot_date < ?`,
      [companyId, teacherId, startStr, endStr]
    ),
    pool.query(
      `SELECT DATE_FORMAT(b.appointment_date, '%Y-%m-%d') AS d, DATE_FORMAT(b.appointment_date, '%H:%i') AS t, tp.duration_minutes
       FROM bookings b
       JOIN student_packages sp ON b.student_package_id = sp.id
       JOIN tutorial_packages tp ON sp.package_id = tp.id
       WHERE b.teacher_id = ? AND b.company_id = ? AND b.status != 'cancelled'
         AND b.appointment_date >= ? AND b.appointment_date < ?`,
      [teacherId, companyId, startStr, endStr]
    ),
  ]);
  const onLeave = new Set(leaves.map((l) => l.d));
  const regularSet = new Set(regular.map(([day, time]) => `${day}|${time}`));
  // Every 30-min slot a class covers
  const booked = new Set();
  for (const b of bookings) {
    const [h, m] = b.t.split(':').map(Number);
    const first = h * 60 + (m < 30 ? 0 : 30);
    const span = Math.max(1, Math.ceil((b.duration_minutes || 25) / 30));
    for (let i = 0; i < span; i++) booked.add(`${b.d}|${toTime(first + i * 30)}`);
  }

  const toOpen = [];
  for (let cur = startStr; cur < endStr; cur = addDays(cur, 1)) {
    if (onLeave.has(cur)) continue;
    const dayName = DAY_NAMES[dayOfWeek(cur)];
    for (const [day, time] of regular) {
      if (day === dayName && !isPast(cur, time)) toOpen.push([companyId, teacherId, cur, `${time}:00`]);
    }
  }
  const toClose = existing
    .filter((s) => !onLeave.has(s.d) && !isPast(s.d, s.t) && !booked.has(`${s.d}|${s.t}`)
      && !regularSet.has(`${DAY_NAMES[dayOfWeek(s.d)]}|${s.t}`))
    .map((s) => [s.d, `${s.t}:00`]);

  let opened = 0;
  let closed = 0;
  if (toOpen.length > 0) {
    const [r] = await pool.query(
      'INSERT IGNORE INTO teacher_available_slots (company_id, teacher_id, slot_date, slot_time) VALUES ?', [toOpen]
    );
    opened = r.affectedRows;
  }
  if (toClose.length > 0) {
    const [r] = await pool.query(
      'DELETE FROM teacher_available_slots WHERE company_id = ? AND teacher_id = ? AND (slot_date, slot_time) IN (?)',
      [companyId, teacherId, toClose]
    );
    closed = r.affectedRows;
  }
  return { opened, closed, leaveDays: [...onLeave].sort() };
}

// Check a { slots: [{ day_of_week, slot_time: "HH:MM" }] } list from a request.
// Returns { error } or { clean }: the slots as [day, time] pairs, deduplicated.
function cleanRegularSlots(slots) {
  if (!Array.isArray(slots)) return { error: 'slots must be a list' };
  if (slots.length > 7 * 48) return { error: 'Too many slots' };
  const clean = new Map();
  for (const sl of slots) {
    const day = DAYS_OF_WEEK.find((d) => d.toLowerCase() === String(sl?.day_of_week || '').toLowerCase());
    const time = String(sl?.slot_time || '');
    if (!day || !/^([01]\d|2[0-3]):(00|30)$/.test(time)) return { error: 'Each slot needs a valid day and a :00 or :30 time' };
    clean.set(`${day}|${time}`, [day, time]);
  }
  return { clean: [...clean.values()] };
}

// Replace all of a teacher's regular open slots with `clean` (from cleanRegularSlots).
async function replaceTeacherRegularSlots(companyId, teacherId, clean) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM teacher_regular_slots WHERE company_id = ? AND teacher_id = ?', [companyId, teacherId]);
    if (clean.length > 0) {
      await connection.query(
        'INSERT INTO teacher_regular_slots (company_id, teacher_id, day_of_week, slot_time) VALUES ?',
        [clean.map(([day, time]) => [companyId, teacherId, day, time])]
      );
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback().catch(() => {});
    throw err;
  } finally {
    connection.release();
  }
}

module.exports = {
  DAYS_OF_WEEK, loadRegularSchedules, loadTeacherRegularSlots, loadTeacherRegularSchedule, findBookablePackage, applyRegularEntries,
  cleanRegularSlots, replaceTeacherRegularSlots, cleanRegularEntries, loadEntryTeachers, writeRegularEntries, syncTeacherHours,
  addTeacherRegularEntry,
};
