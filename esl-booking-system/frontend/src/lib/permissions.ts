// Sub-admin access permissions, grouped by admin page.
// Keep keys in sync with backend/utils/permissions.js.

export type PageKey = "dashboard" | "calendar" | "packages" | "students" | "teachers" | "admins";

export interface PermissionDef {
  key: string;
  label: string;
  description?: string;
}

export interface PermissionGroup {
  page: PageKey;
  label: string;
  path: string;
  // Every page's first entry is its `<page>.view` key
  permissions: PermissionDef[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    page: "dashboard",
    label: "Dashboard",
    path: "/admin-dashboard",
    permissions: [
      { key: "dashboard.view", label: "View dashboard", description: "Stats, today's classes, enrollees and feedback" },
      { key: "dashboard.confirm_payments", label: "Confirm / reject payments" },
      { key: "dashboard.cancel_classes", label: "Cancel classes" },
    ],
  },
  {
    page: "calendar",
    label: "Calendar",
    path: "/admin/calendar",
    permissions: [
      { key: "calendar.view", label: "View calendar" },
      { key: "calendar.book_classes", label: "Book classes" },
      { key: "calendar.cancel_classes", label: "Cancel classes" },
      { key: "calendar.manage_slots", label: "Open / close teacher slots" },
    ],
  },
  {
    page: "packages",
    label: "Packages",
    path: "/packages",
    permissions: [
      { key: "packages.view", label: "View packages" },
      { key: "packages.add", label: "Add packages" },
      { key: "packages.edit", label: "Edit packages" },
      { key: "packages.delete", label: "Delete packages" },
      { key: "packages.edit_settings", label: "Edit company settings", description: "Payment QR, cancellation policy, teacher picking" },
    ],
  },
  {
    page: "students",
    label: "Students",
    path: "/students",
    permissions: [
      { key: "students.view", label: "View students" },
      { key: "students.add", label: "Add / import students" },
      { key: "students.edit", label: "Edit student details", description: "Includes assigning teachers" },
      { key: "students.assign_package", label: "Assign / share packages" },
      { key: "students.add_sessions", label: "Add sessions" },
      { key: "students.deduct_sessions", label: "Deduct sessions" },
      { key: "students.book_classes", label: "Book classes", description: "Single and recurring" },
      { key: "students.cancel_classes", label: "Cancel classes" },
      { key: "students.reset_password", label: "Reset passwords" },
      { key: "students.deactivate", label: "Deactivate / reactivate" },
      { key: "students.delete", label: "Delete students" },
    ],
  },
  {
    page: "teachers",
    label: "Teachers",
    path: "/teachers",
    permissions: [
      { key: "teachers.view", label: "View teachers" },
      { key: "teachers.add", label: "Add / import teachers" },
      { key: "teachers.edit", label: "Edit teachers" },
      { key: "teachers.delete", label: "Delete teachers" },
      { key: "teachers.manage_schedule", label: "Manage teacher schedules" },
      { key: "teachers.manage_leaves", label: "Approve / reject leaves" },
      { key: "teachers.reset_password", label: "Reset passwords" },
    ],
  },
  {
    page: "admins",
    label: "Admins",
    path: "/admin-users",
    permissions: [
      { key: "admins.view", label: "View admins" },
      { key: "admins.add", label: "Add admins" },
      { key: "admins.edit_permissions", label: "Edit admin permissions", description: "Can only grant permissions they have themselves" },
      { key: "admins.delete", label: "Delete admins" },
    ],
  },
];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));

export const viewKey = (page: PageKey) => `${page}.view`;

/** Drop actions whose page isn't viewable — mirrors the backend's sanitizer. */
export function sanitizePermissions(list: string[]): string[] {
  const set = new Set(list);
  for (const g of PERMISSION_GROUPS) {
    if (!set.has(viewKey(g.page))) g.permissions.forEach((p) => set.delete(p.key));
  }
  return ALL_PERMISSIONS.filter((k) => set.has(k));
}

export type PageAccessLevel = "none" | "view" | "custom" | "full";

export function pageAccessLevel(group: PermissionGroup, perms: string[]): PageAccessLevel {
  const held = group.permissions.filter((p) => perms.includes(p.key)).length;
  if (held === 0) return "none";
  if (held === group.permissions.length) return "full";
  if (held === 1 && perms.includes(viewKey(group.page))) return "view";
  return "custom";
}

// Notification categories a sub-admin can be opted out of (stored as the muted
// list). Keep keys in sync with backend/utils/notificationCategories.js.
export interface NotificationCategory {
  key: string;
  label: string;
  description: string;
}

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  { key: "low_sessions", label: "Low class sessions", description: "A student is running out of sessions" },
  { key: "new_student", label: "New student", description: "A student registers" },
  { key: "package_availed", label: "Package availed", description: "A student avails a package and needs payment confirmation" },
  { key: "new_teacher", label: "New teacher", description: "A teacher registers or logs in for the first time" },
  { key: "booking_created", label: "New bookings", description: "Classes or recurring schedules are booked" },
  { key: "booking_cancelled", label: "Cancelled bookings", description: "Classes or recurring schedules are cancelled" },
  { key: "leave_requested", label: "Leave requests", description: "A teacher requests a day off" },
  { key: "teacher_issues", label: "Teacher issues", description: "Teacher no-shows and deactivations" },
  { key: "student_feedback", label: "Student feedback", description: "A student submits feedback" },
  { key: "bulk_import", label: "Bulk imports", description: "A student or teacher import finishes" },
  { key: "announcement", label: "Announcements", description: "Platform announcements" },
];
