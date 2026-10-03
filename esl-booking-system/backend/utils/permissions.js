const pool = require('../db');

/**
 * Sub-admin access permissions, grouped by the admin page they belong to.
 * Every page has a `<page>.view` key that gates the page itself; the rest are
 * individual actions on it. The company owner implicitly holds every key.
 *
 * Keep in sync with frontend/src/lib/permissions.ts.
 */
const PERMISSION_GROUPS = {
  dashboard: ['dashboard.view', 'dashboard.confirm_payments', 'dashboard.cancel_classes'],
  calendar: ['calendar.view', 'calendar.book_classes', 'calendar.cancel_classes', 'calendar.manage_slots'],
  packages: ['packages.view', 'packages.add', 'packages.edit', 'packages.delete', 'packages.edit_settings'],
  students: [
    'students.view', 'students.add', 'students.edit', 'students.assign_package',
    'students.add_sessions', 'students.deduct_sessions', 'students.book_classes',
    'students.cancel_classes', 'students.reset_password', 'students.deactivate', 'students.delete',
  ],
  teachers: [
    'teachers.view', 'teachers.add', 'teachers.edit', 'teachers.delete',
    'teachers.manage_schedule', 'teachers.manage_leaves', 'teachers.reset_password',
  ],
  admins: ['admins.view', 'admins.add', 'admins.edit_permissions', 'admins.delete'],
};

const ALL_PERMISSIONS = Object.values(PERMISSION_GROUPS).flat();
const ALL_PERMISSIONS_SET = new Set(ALL_PERMISSIONS);

/**
 * Permissions for a sub-admin created before granular permissions existed
 * (permissions column still NULL). Back then every sub-admin could do everything
 * except add/edit/delete teachers (gated by the three legacy flags) and manage
 * other admins (owner only) — this reproduces exactly that, so nobody gains or
 * loses access when the column is introduced.
 */
function legacyPermissions(row) {
  const perms = ALL_PERMISSIONS.filter(p =>
    !p.startsWith('admins.') && !['teachers.add', 'teachers.edit', 'teachers.delete'].includes(p)
  );
  perms.push('admins.view');
  if (row?.can_add_teacher) perms.push('teachers.add');
  if (row?.can_edit_teacher) perms.push('teachers.edit');
  if (row?.can_delete_teacher) perms.push('teachers.delete');
  return perms;
}

/** Parse a stored permissions value into a clean array of known keys. */
function parsePermissions(raw) {
  if (raw == null) return null;
  let list = raw;
  if (typeof raw === 'string') {
    try { list = JSON.parse(raw); } catch { return []; }
  }
  return Array.isArray(list) ? sanitizePermissions(list) : [];
}

/**
 * Drop unknown keys, and drop actions whose page `view` key isn't granted —
 * an action on a page you can't open is meaningless and would only confuse.
 */
function sanitizePermissions(list) {
  if (!Array.isArray(list)) return [];
  const set = new Set(list.filter(p => ALL_PERMISSIONS_SET.has(p)));
  for (const [page, keys] of Object.entries(PERMISSION_GROUPS)) {
    if (!set.has(`${page}.view`)) keys.forEach(k => set.delete(k));
  }
  return ALL_PERMISSIONS.filter(p => set.has(p));
}

/**
 * Resolve a company_admin's effective access.
 * Returns { is_owner, permissions: string[] }.
 */
async function getAdminAccess(userId) {
  const [[row]] = await pool.query(
    `SELECT u.is_owner, ap.permissions, ap.can_add_teacher, ap.can_edit_teacher, ap.can_delete_teacher
     FROM users u
     LEFT JOIN admin_permissions ap ON ap.user_id = u.id
     WHERE u.id = ?`,
    [userId]
  );
  if (!row) return { is_owner: false, permissions: [] };
  if (row.is_owner) return { is_owner: true, permissions: [...ALL_PERMISSIONS] };
  const parsed = parsePermissions(row.permissions);
  return { is_owner: false, permissions: parsed ?? legacyPermissions(row) };
}

/** True when the admin holds at least one of the given permission keys. */
async function hasAnyPermission(userId, ...keys) {
  const access = await getAdminAccess(userId);
  if (access.is_owner) return true;
  return keys.some(k => access.permissions.includes(k));
}

/**
 * Express middleware: a company_admin must hold at least ONE of the listed
 * permissions. Other roles pass straight through, so routes shared with
 * students/teachers (e.g. /api/recurring) keep relying on requireRole alone.
 */
const requirePermission = (...keys) => async (req, res, next) => {
  if (req.user?.role !== 'company_admin') return next();
  try {
    const access = await getAdminAccess(req.user.id);
    req.adminAccess = access;
    if (access.is_owner || keys.some(k => access.permissions.includes(k))) return next();
    return res.status(403).json({ message: 'You do not have permission to do this', required: keys });
  } catch (err) {
    console.error('[requirePermission]', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  PERMISSION_GROUPS,
  ALL_PERMISSIONS,
  legacyPermissions,
  parsePermissions,
  sanitizePermissions,
  getAdminAccess,
  hasAnyPermission,
  requirePermission,
};
