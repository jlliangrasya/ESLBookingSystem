# Changelog — 2026-03-31

## Overview

This session addressed **two major categories** of issues: a **package replacement bug** where buying a new package overwrote the existing one, and **13 systemic issues** spanning session integrity, authorization, data staleness, and UI bugs.

**Files modified (8):**
- `backend/routes/bookingRoutes.js`
- `backend/routes/teacherRoutes.js`
- `backend/routes/adminRoutes.js`
- `backend/routes/packageRoutes.js`
- `backend/routes/studentRoutes.js`
- `backend/routes/exportRoutes.js`
- `frontend/src/pages/StudentDashboard.tsx`
- `frontend/src/pages/TimeslotPage.tsx`

---

## Part 1: Package Append Instead of Replace

### Problem
When a student already had a paid package with remaining sessions and purchased a new one, the system treated only the most recent `student_packages` row as active (via `ORDER BY purchased_at DESC LIMIT 1`). The old package's remaining sessions became invisible and inaccessible.

### Changes

#### `packageRoutes.js` — `POST /package/confirm/:id`
- When confirming payment, the system now checks if the student already has an existing paid package.
- If one exists, the new package's sessions are **added** to the existing package's `sessions_remaining`. The new row is kept as an audit record with `sessions_remaining = 0`.
- The existing-package lookup uses `ORDER BY CASE WHEN sessions_remaining > 0 THEN 0 ELSE 1 END` to always find the active package first, preventing orphaned sessions across multiple merges.

#### `packageRoutes.js` — `GET /avail`
- Now filters by `payment_status = 'paid' AND sessions_remaining > 0` so an unpaid/pending package never overshadows the active paid one.

#### `adminRoutes.js` — `POST /students/:id/assign-package`
- Same merge logic: if the student already has a paid package, sessions are added to it instead of creating a separate active package.

#### `adminRoutes.js` — Admin student profile query
- Changed from computed `tp.session_limit - done_count` to `sp.sessions_remaining` directly, and filters by `payment_status = 'paid' AND sessions_remaining > 0`.

#### `studentRoutes.js` — `GET /dashboard`
- Package query now uses `sp.sessions_remaining` directly (instead of computing from `tp.session_limit - done_count`, which wouldn't reflect merged sessions).
- Bookings are now fetched across **all** student packages for the student (not just one), so bookings from older packages still appear.

#### `studentRoutes.js` — Student list, pending packages, paid packages queries
- All updated to use `sp.sessions_remaining` directly.
- `ROW_NUMBER()` ordering now prefers paid packages with remaining sessions.

#### `studentRoutes.js` — Feedback route
- Teacher lookup for feedback routing now filters by `payment_status = 'paid' AND sessions_remaining > 0`.

#### `exportRoutes.js` — Student export
- `ROW_NUMBER()` ordering updated to prefer paid packages with remaining sessions.

---

## Part 2: Systemic Fixes (13 Issues)

### Issue #1 — Students could overbook beyond their session limit

**Problem:** Sessions were only deducted when a class was marked "done", not when the booking was created. A student with 1 session could create unlimited bookings because the check passed every time (remaining was never decremented).

**Fix (`bookingRoutes.js` — `POST /api/bookings`):**
- Sessions are now deducted **immediately at booking time** inside the existing transaction, after the booking INSERT and before COMMIT.
- The `FOR UPDATE` row lock on `student_packages` prevents concurrent bookings from racing past the check.

---

### Issue #2 — No session refund on cancellation

**Problem:** When a booking was cancelled (by student, teacher, or admin), sessions were never returned. Combined with fix #1, this became critical.

**Fix — three cancel paths updated:**

**Student cancel (`bookingRoutes.js` — `DELETE /api/bookings/:id`):**
- Added status guard: blocks cancelling already-done or already-cancelled bookings.
- For group bookings: counts active slots in the group before deleting, refunds the full count.
- For single bookings: refunds 1 session.

**Admin cancel (`bookingRoutes.js` — `POST /api/bookings/cancel/:id`):**
- Only refunds if the booking's current status is not already 'done' or 'cancelled'.
- Made group-aware: cancels all slots in a multi-slot group and refunds the full count.

**Teacher cancel (`teacherRoutes.js` — `POST /bookings/:id/cancel`):**
- Refunds session after cancelling.
- Made group-aware: cancels all slots in the group and refunds the full count.

---

### Issue #3 — Mark-done could double-deduct sessions

**Problem:** No idempotency check existed. Clicking "Mark Done" twice would deduct sessions twice.

**Fix:**

**Admin mark-done (`bookingRoutes.js` — `POST /api/bookings/done/:id`):**
- Removed session deduction entirely (sessions are now deducted at booking time).
- Added idempotency guard: if `status === 'done'`, returns 400 "already marked as done".
- Group mark-done now excludes already-done and cancelled bookings.

**Teacher mark-done (`teacherRoutes.js` — `POST /bookings/:id/done`):**
- Removed session deduction entirely.
- Idempotency is enforced by the SELECT filter (`status IN ('pending', 'confirmed')`), which returns 404 on a second attempt.

---

### Issue #4 — Teacher UPDATE statements missing authorization scoping

**Problem:** SELECT queries validated that a booking belonged to the teacher, but the subsequent UPDATE statements used `WHERE id = ?` without `teacher_id` or `company_id`, allowing cross-company manipulation by guessing IDs.

**Fix (`teacherRoutes.js`):**
- `PUT /bookings/:id/class-info`: UPDATE now includes `AND teacher_id = ?`
- `POST /bookings/:id/mark-student-absent`: UPDATE now includes `AND teacher_id = ?`
- `POST /bookings/:id/cancel`: UPDATE now includes `AND teacher_id = ? AND company_id = ?`
- `POST /bookings/:id/done`: UPDATE now includes `AND teacher_id = ? AND company_id = ?`

---

### Issue #5 — Dashboard not refreshed after package purchase

**Problem:** After `confirmPackage()`, the modal closed but `setPackageDetails` was never updated. The student saw stale data. Errors were silently swallowed.

**Fix (`StudentDashboard.tsx`):**
- Extracted `fetchStudentData` out of the `useEffect` so it can be called from `confirmPackage`.
- After successful package avail, `fetchStudentData()` is called to refresh the dashboard.
- Errors now shown to the user via `alert()` instead of silent `console.error`.

---

### Issue #6 — Timeslot page not refreshed after booking

**Problem:** After confirming a booking, there was no call to refresh the slot data. The booked slot still appeared available.

**Fix (`TimeslotPage.tsx`):**
- After successful booking confirmation, `fetchBookedSlots()` and `fetchTeacherSlots()` are called to immediately update the UI.

---

### Issue #7 — Enrolled flag inverted in student list

**Problem:** The SQL `CASE WHEN sp.payment_status = 'paid' AND sp.sessions_remaining = 0 THEN TRUE` marked students as "enrolled" when they had **zero** sessions (exhausted), which is the opposite of the intended meaning.

**Fix (`studentRoutes.js`):**
- Changed to `sp.sessions_remaining > 0`.

---

### Issue #8 — Admin booking creation skipped session validation

**Problem:** Admin could create bookings for packages with 0 sessions or unpaid packages. No validation existed.

**Fix (`adminRoutes.js` — `POST /bookings`):**
- Added `payment_status` check: blocks if not 'paid'.
- Added `sessions_remaining` check: blocks if <= 0.
- Added session deduction after INSERT (consistent with student booking).

---

### Issue #9 — Auto mark-done ran on every page load

**Problem:** `GET /api/completed-bookings` silently ran `UPDATE bookings SET status = 'done' WHERE appointment_date < NOW()` every time the admin loaded the page. This marked classes as "done" without explicit teacher/admin confirmation.

**Fix (`bookingRoutes.js`):**
- Removed the auto-mark-done UPDATE. Classes must now be explicitly confirmed by teacher or admin.
- With sessions deducted at booking time (fix #1), no session impact from this change.

---

### Issue #10 — Bookings not cleaned when package rejected

**Problem:** Rejecting a student package didn't cancel associated bookings. Orphaned confirmed bookings remained in the system.

**Fix (`packageRoutes.js` — `POST /package/reject/:id`):**
- After rejecting, counts active bookings for the package.
- Cancels them all and refunds the corresponding sessions.

---

### Issue #11 — Teacher dashboard used computed sessions instead of actual

**Problem:** Teacher dashboard computed `sessions_remaining` as `tp.session_limit - done_count`, which was wrong after package merging (fix Part 1) and after session deduction at booking time (fix #1).

**Fix (`teacherRoutes.js` — dashboard query):**
- Changed to use `sp.sessions_remaining` directly.

---

### Issue #12 — Exhausted package hid existing bookings on timeslot page

**Problem:** `fetchBookedSlots` had `if (userPackageId === null) return`, so when a student's package ran out of sessions, their existing booked classes disappeared from the timeslot view.

**Fix (`TimeslotPage.tsx`):**
- Changed the guard to `if (!contextLoaded) return` instead of checking `userPackageId`.
- Changed `isBookedByUser` check from `bookedSlots[slot].student_package_id === userPackageId` to simply `slot in bookedSlots` (since the API already filters by student_id, all entries in `bookedSlots` are the current student's own bookings). This also fixes click behavior when clicking on own classes with an exhausted/merged package.

---

### Issue #13 — Booked slots flickered on first load

**Problem:** On the timeslot page, other students' "BOOKED" slots appeared for ~1 second then disappeared. Root cause: `fetchTeacherSlots` ran immediately without `effectiveTeacherId` (querying ALL teachers), then re-ran after `fetchStudentContext` set the teacher ID (querying only the assigned teacher). Slots from other teachers vanished on the second render.

**Fix (`TimeslotPage.tsx`):**
- Added `contextLoaded` state flag, initialized to `false`.
- Both `fetchBookedSlots` and `fetchTeacherSlots` now wait for `contextLoaded === true` before executing.
- `contextLoaded` is set to `true` in the `finally` block of `fetchStudentContext`, ensuring it fires even on error.
- This means slot data is only fetched once, with the correct `effectiveTeacherId` already set.

---

## Session Lifecycle Summary (New Model)

```
BOOKING CREATED  → sessions_remaining decremented (inside transaction with row lock)
BOOKING CANCELLED → sessions_remaining incremented (refund)
BOOKING MARKED DONE → no session change (just status update)
PACKAGE CONFIRMED → sessions merged into existing paid package if one exists
PACKAGE REJECTED → active bookings cancelled + sessions refunded
```

---

## Part 3: Security, Authorization & Infrastructure Fixes (15 Issues)

**Files modified:**
- `backend/routes/packageRoutes.js`
- `backend/routes/adminRoutes.js`
- `backend/routes/superAdminRoutes.js`
- `backend/routes/reportRoutes.js`
- `backend/middleware/authMiddleware.js`
- `backend/utils/notify.js`
- `backend/migrations/002_add_foreign_key_cascades.sql` (new)

---

### Issue #1 — Package payment confirmation race condition

**Problem:** `POST /package/confirm/:id` had no transaction wrapping. Two admins confirming simultaneously could both read the same state and double the sessions.

**Fix (`packageRoutes.js`):**
- Wrapped entire confirm flow in a database transaction.
- Added `FOR UPDATE` lock on both the new package row and the existing paid package row.
- All UPDATEs now use the transaction connection.
- Proper `rollback` + `connection.release()` in `catch`/`finally`.

---

### Issue #2 — Cross-company authorization gaps in admin routes

**Problem:** Several UPDATE statements omitted `company_id` from their WHERE clause, allowing potential cross-company data manipulation if user IDs were guessed.

**Fix (`adminRoutes.js`):**
- **Permission modification** (`PUT /admins/:id/permissions`): Added SELECT to verify target user belongs to the same company before modifying permissions.
- **Bulk teacher assignment** (`POST /students/:id/bulk-assign-teacher`): Added `AND company_id = ?` to the booking UPDATE.
- **Package session merge** (`POST /students/:id/assign-package`): Added `AND company_id = ?` to the session increment UPDATE.
- **Password reset** (`PUT /users/:id/reset-password`): Added `AND company_id = ?` to the password UPDATE.

---

### Issue #3 + #4 — Deactivated users can still use the system / No token revocation

**Problem:** JWT tokens are valid for 7 days. Deactivated or deleted users could continue accessing the system until token expiry. No revocation mechanism existed.

**Fix (`middleware/authMiddleware.js`):**
- Added `is_active` check on every authenticated request. The middleware now queries `users` to verify the account still exists and is active.
- Deleted accounts return 401 "Account no longer exists."
- Deactivated accounts return 403 "Your account has been deactivated."
- This effectively acts as token revocation — deactivation takes effect on the very next API call.

---

### Issue #5 — Teacher deactivation doesn't cancel bookings

**Problem:** Soft-deleting a teacher left all their future bookings in `confirmed`/`pending` status. Students would show up to class with no teacher.

**Fix (`adminRoutes.js` — `DELETE /teachers/:id`):**
- After deactivating, queries all future active bookings assigned to the teacher.
- Cancels them all and refunds sessions to each affected student package.
- Sends notifications to all affected students explaining their classes were cancelled and sessions refunded.

---

### Issue #6 — Student deactivation doesn't cancel bookings

**Problem:** Same issue — deactivated students' future bookings remained active, consuming teacher availability.

**Fix (`adminRoutes.js` — `POST /students/:id/deactivate`):**
- Cancels all future active bookings for the student.
- Refunds sessions to the corresponding student packages.

---

### Issue #7 — Hard user deletion has incomplete cascade and no transaction

**Problem:** `DELETE /users/:id` in superAdminRoutes ran ~12 sequential DELETEs without a transaction. A failure mid-way left partially deleted data. Missing cleanup for `student_feedback.teacher_id`, `company_payments.recorded_by`, `waitlist`, and `session_adjustments` linked to student packages. No audit log was written.

**Fix (`superAdminRoutes.js`):**
- Wrapped all deletion queries in a single database transaction.
- Added missing cleanup: `class_reports` by teacher_id, `student_feedback` by teacher_id, `waitlist` by student_id/teacher_id, `session_adjustments` by student_package_id.
- Set `recorded_by = NULL` on `company_payments` and `processed_by = NULL` on `upgrade_requests` (preserve records, remove user reference).
- Added `logAction()` audit entry after successful commit.

---

### Issue #8 — No foreign key CASCADE in database schema

**Problem:** Out of ~19 foreign key constraints, only 2 had `ON DELETE CASCADE`. Deleting referenced rows silently orphaned data.

**Fix (new migration `002_add_foreign_key_cascades.sql`):**
- `ON DELETE CASCADE` added for: bookings→student_packages, class_reports→bookings, student_packages→users, student_feedback→users (student), teacher_leaves→users, teacher_available_slots→users, closed_slots→users, waitlist→users, session_adjustments→student_packages.
- `ON DELETE SET NULL` added for: bookings.teacher_id→users, student_packages.teacher_id→users, student_feedback.teacher_id→users (preserves booking/package history when teacher is deleted).

---

### Issue #9 — Admin booking creation lacks transaction protection

**Problem:** Admin booking INSERT + session deduction were two separate queries with no transaction. Double-click could deduct sessions twice.

**Fix (`adminRoutes.js` — `POST /bookings`):**
- Wrapped in a transaction with `FOR UPDATE` lock on the student_packages row.
- All overlap checks and the INSERT now use the transaction connection.
- Proper `rollback` + `connection.release()` in `catch`/`finally`.

---

### Issue #10 — No validation on company settings

**Problem:** `cancellation_hours` accepted any value: negative numbers, strings, absurdly large values.

**Fix (`adminRoutes.js` — `PUT /company-settings`):**
- Added `parseInt` + range validation for `cancellation_hours` (0–168, i.e. 0–1 week).
- Added `payment_method` validation against allowed values (`encasher`, `communication_platform`, `null`).

---

### Issue #14 — Class reports allow overwriting and pre-submission

**Problem:** Reports could be submitted for bookings in `confirmed` status (before class happened).

**Fix (`reportRoutes.js` — `POST /`):**
- Changed status check from `IN ('confirmed', 'done')` to `= 'done'` only.
- Updated error message to clarify reports require class completion first.

---

### Issue #15 — Report access lacks role-based filtering

**Problem:** Any authenticated user in the same company could view any report by booking ID.

**Fix (`reportRoutes.js` — `GET /booking/:booking_id`):**
- Students can only view reports where `cr.student_id` matches their user ID.
- Teachers can only view reports where `cr.teacher_id` matches their user ID.
- Company admins retain full access to all reports in their company.

---

### Issue #16 — Subscription plan disable has no impact check

**Problem:** Disabling a plan didn't check or warn if companies were actively using it.

**Fix (`superAdminRoutes.js` — `POST /plans/:id/disable`):**
- Counts active companies on the plan before disabling.
- Returns the count in the response with a warning message if > 0.

---

### Issue #17 — Upgrade request approval doesn't validate plan still exists

**Problem:** If a plan was deleted between request and approval, the company got assigned to a non-existent plan.

**Fix (`superAdminRoutes.js` — `POST /upgrade-requests/:id/approve`):**
- Added null check: returns 400 if plan no longer exists.
- Added `is_active` check: returns 400 if plan has been disabled.

---

### Issue #18 — Notification system is blocking

**Problem:** `notify()` was async and callers awaited it, meaning a slow DB insert or socket emit would delay the parent API response.

**Fix (`utils/notify.js`):**
- Changed `notify()` from `async function` to a synchronous function that spawns the async work in a detached IIFE.
- Callers no longer need to (or can) await it — it's fire-and-forget.
- Failures are still logged but never propagate to the caller.

---

## Part 4: Session Count — One Class = One Session (2026-04-01)

**Problem reported by student:** A 50-minute class deducted 2 sessions from the package instead of 1. The system was treating each 30-minute timeslot as one session, so a 50-minute class (2 consecutive slots) deducted 2 sessions.

**Business rule clarified:** One booking = one class = one session, regardless of how many consecutive 30-minute timeslots the class spans. `slotsNeeded` should only control teacher availability blocking, not session accounting.

### Files modified: 5 backend files + 3 i18n files

### Fix 1 — Student booking creation (`bookingRoutes.js`)
- Session check changed from `sessions_remaining < slotsNeeded` to `sessions_remaining <= 0`. A student only needs 1 session to book any class duration.
- Session deduction changed from `sessions_remaining - slotsNeeded` to `sessions_remaining - 1`.
- `slotsNeeded` is still used to book consecutive timeslots in `teacher_available_slots` (teacher scheduling remains unchanged).

### Fix 2 — Student cancel refund (`bookingRoutes.js`)
- Refund changed from "count of active group slots" to always `+1 session`.
- All slots in the group are still cancelled (teacher availability correctly freed).

### Fix 3 — Admin cancel refund (`bookingRoutes.js`)
- Same fix: refund is always `+1 session` per class cancelled, regardless of slot count.

### Fix 4 — Teacher cancel refund (`teacherRoutes.js`)
- Same fix: refund is always `+1 session` per class cancelled.

### Fix 5 — Package rejection refund (`packageRoutes.js`)
- The reject flow counts raw booking rows to refund. For a 50-min class this would count 2 rows and refund 2 sessions, but only 1 was deducted.
- Fixed to count distinct classes using `COUNT(DISTINCT COALESCE(booking_group_id, CAST(id AS CHAR)))` — each unique class (group or individual slot) = 1 session refunded.

### Fix 6 — Frontend messages (`en.json`, `zh.json`, `ko.json`)
- `timeslot.durationNote`: Changed "{{slots}} sessions deducted" → "1 session deducted".
- `timeslot.confirmMulti`: Changed "use {{slots}} sessions" → "use 1 session".
