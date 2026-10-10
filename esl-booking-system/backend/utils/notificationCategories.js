/**
 * Notification categories a sub-admin can be opted out of. Each category groups
 * the notify() `type`s it covers. Types not listed here (billing, account status,
 * onboarding) always reach the owner and can't be muted.
 *
 * Keep in sync with NOTIFICATION_CATEGORIES in frontend/src/lib/permissions.ts.
 */
const NOTIFICATION_CATEGORIES = {
  low_sessions: ['low_sessions'],
  new_student: ['new_student'],
  package_availed: ['package_availed'],
  new_teacher: ['new_teacher', 'onboarding_milestone'],
  booking_created: ['booking_created', 'recurring_schedule_created'],
  booking_cancelled: ['booking_cancelled', 'recurring_schedule_cancelled'],
  leave_requested: ['leave_requested'],
  teacher_issues: ['teacher_no_show', 'teacher_deactivated'],
  late_notice: ['late_notice_half_credit', 'half_credit_paid'],
  student_feedback: ['student_feedback'],
  bulk_import: ['bulk_import'],
  announcement: ['announcement'],
};

const ALL_NOTIFICATION_CATEGORIES = Object.keys(NOTIFICATION_CATEGORIES);

const CATEGORY_BY_TYPE = {};
for (const [cat, types] of Object.entries(NOTIFICATION_CATEGORIES)) {
  for (const t of types) CATEGORY_BY_TYPE[t] = cat;
}

/** Parse a stored muted-categories value into a clean array of known keys. */
function parseMuted(raw) {
  if (raw == null) return [];
  let list = raw;
  if (typeof raw === 'string') {
    try { list = JSON.parse(raw); } catch { return []; }
  }
  return Array.isArray(list) ? list.filter(c => ALL_NOTIFICATION_CATEGORIES.includes(c)) : [];
}

module.exports = { NOTIFICATION_CATEGORIES, ALL_NOTIFICATION_CATEGORIES, CATEGORY_BY_TYPE, parseMuted };
