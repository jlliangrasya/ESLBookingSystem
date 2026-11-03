const pool = require('../db');
const { bookRecurringSchedule } = require('./recurringBooking');

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
 * on { error } the caller must roll back, so a shortfall books nothing.
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
    'SELECT sessions_remaining FROM student_packages WHERE id = ? AND company_id = ?', [studentPackageId, companyId]
  );
  if (!pkg) return { error: { status: 404, message: 'Student package not found' } };

  const results = [];
  const teacherIds = new Set();
  let totalBooked = 0;
  let sessionsRemaining = pkg.sessions_remaining;
  for (const g of groups.values()) {
    const booked = await bookRecurringSchedule(connection, {
      companyId, actorRole, actorId, studentPackageId, studentId, teacherId: g.teacherId,
      daysOfWeek: g.days, startTime: g.time, numWeeks: weeks, startDate: startDate || null,
    });
    if (booked.error) {
      const { code, status, body } = booked.error;
      if (code === 'NO_AVAILABLE_DATES' || code === 'NO_MATCHING_DATES') {
        results.push({ label: labelOf(g), sessions_booked: 0, skipped_dates: body.skipped_dates || [] });
        continue;
      }
      if (code === 'NOT_ENOUGH_SESSIONS') {
        const needed = totalBooked + (body.sessions_needed || 1);
        return { error: { status: 403, message: `Not enough sessions: ${pkg.sessions_remaining} remaining, but this schedule needs at least ${needed} classes over ${weeks} week${weeks === 1 ? '' : 's'}. Choose fewer weeks or add sessions. Nothing was booked.` } };
      }
      return { error: { status, message: `${labelOf(g)}: ${body.message} Nothing was booked.` } };
    }
    totalBooked += booked.sessionsBooked;
    sessionsRemaining = booked.sessionsRemaining;
    teacherIds.add(booked.teacherId);
    results.push({ label: labelOf(g), sessions_booked: booked.sessionsBooked, skipped_dates: booked.skippedDates });
  }

  if (totalBooked === 0) {
    return { error: { status: 400, message: 'No classes could be booked. Every date has a conflict.', groups: results } };
  }
  return { totalBooked, sessionsRemaining, groups: results, teacherIds: [...teacherIds] };
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

module.exports = {
  DAYS_OF_WEEK, loadRegularSchedules, loadTeacherRegularSlots, loadTeacherRegularSchedule, findBookablePackage, applyRegularEntries,
};
