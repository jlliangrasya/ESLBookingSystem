# Sessions Display Update — Remaining vs Available to Book

**Date:** 2026-04-07

## Summary

Added a new **computed** field `unused_sessions` alongside the existing `sessions_remaining` to give users clearer visibility into their session usage. No changes were made to any booking, cancellation, or refund logic.

## Definitions

| Label | Field | Meaning | Example |
|-------|-------|---------|---------|
| **"X remaining"** | `unused_sessions` | Sessions not yet completed (booked or not) | Student bought 10, completed 2 → **8 remaining** |
| **"X available to book"** | `sessions_remaining` | Sessions not yet scheduled | Of those 8, 3 are already booked → **5 available to book** |

The "available to book" badge **only appears when it differs from remaining** (i.e., when the student has active bookings).

**Formula:** `unused_sessions = sessions_remaining + active bookings count`

- `sessions_remaining` (available to book) is the existing database column — unchanged
- `unused_sessions` (remaining) is computed on-the-fly in SQL queries — **no new database column**

## i18n Translations

| Key | English | Chinese | Korean |
|-----|---------|---------|--------|
| `sessionsRemaining` | "X remaining" | "剩余 X 节课" | "남은 수업 X회" |
| `sessionsAvailableToBook` | "X available to book" | "可预约 X 节课" | "예약 가능 X회" |

## What Changed

### Backend (computed field added to 4 endpoints)

| File | Endpoint | Change |
|------|----------|--------|
| `studentRoutes.js` | `GET /api/student/dashboard` | Added subquery to compute `unused_sessions` on the student's active package |
| `studentRoutes.js` | `GET /api/student/students` | Added LEFT JOIN on active bookings count to compute `unused_sessions` per student |
| `adminRoutes.js` | `GET /api/admin/students/:id` | Added subquery to compute `unused_sessions` on the student's active package |
| `teacherRoutes.js` | `GET /api/teacher/dashboard` | Added subquery to compute `unused_sessions` on each assigned student's package |

The subquery used:
```sql
sessions_remaining + (
  SELECT COUNT(DISTINCT COALESCE(b.booking_group_id, CAST(b.id AS CHAR)))
  FROM bookings b
  WHERE b.student_package_id = sp.id AND b.status NOT IN ('done','cancelled')
) AS unused_sessions
```

### Frontend (both values displayed in 4 pages)

| File | What Changed |
|------|--------------|
| `StudentDashboard.tsx` | Package card shows primary badge "X unused" + outline badge "X unbooked" |
| `StudentList.tsx` | Sessions column shows "X unused" badge; "X unbooked" badge only when different |
| `AdminStudentProfilePage.tsx` | Package card shows both badges; session adjustment preview shows both values |
| `TeacherDashboard.tsx` | Assigned students table shows both badges |

The "unbooked" badge is **only shown when it differs from unused** (i.e., when the student has active bookings), keeping the UI clean.

### Interface Updates

Added `unused_sessions: number` to:
- `PackageDetails` in `StudentDashboard.tsx`
- `Student` in `StudentList.tsx`
- `ActivePackage` in `AdminStudentProfilePage.tsx`
- `AssignedStudent` in `TeacherDashboard.tsx`

## What Did NOT Change

- **Booking logic** — sessions are still deducted at booking time
- **Cancel/refund logic** — sessions are still refunded on cancellation
- **Mark-done logic** — no session change at completion
- **Database schema** — no new columns, no migrations needed
- **`sessions_remaining` column** — untouched, still means "unbooked sessions"
