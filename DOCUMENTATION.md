# ESL Booking System — Complete Product Documentation

> **Version:** 1.0 · **Last Updated:** May 2026  
> For product inquiries, visit your deployment URL or contact your system administrator.

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Who It's For](#2-who-its-for)
3. [Core Features](#3-core-features)
4. [User Roles & Permissions](#4-user-roles--permissions)
5. [Feature Walkthrough by Role](#5-feature-walkthrough-by-role)
   - [Students](#51-student-experience)
   - [Teachers](#52-teacher-experience)
   - [Company Admins](#53-company-admin-experience)
   - [Super Admins](#54-super-admin-experience)
6. [Booking & Scheduling System](#6-booking--scheduling-system)
7. [Package & Payment Management](#7-package--payment-management)
8. [Notifications & Communication](#8-notifications--communication)
9. [Assignments & Progress Tracking](#9-assignments--progress-tracking)
10. [Recurring Schedules](#10-recurring-schedules)
11. [Bulk Import & Export](#11-bulk-import--export)
12. [Platform Administration](#12-platform-administration)
13. [Security & Privacy](#13-security--privacy)
14. [Technical Architecture](#14-technical-architecture)
15. [Deployment & Hosting](#15-deployment--hosting)
16. [Frequently Asked Questions](#16-frequently-asked-questions)

---

## 1. Product Overview

**ESL Booking System** is a full-featured, cloud-based platform built specifically for ESL (English as a Second Language) tutoring companies. It brings together student management, teacher scheduling, class booking, payment tracking, and real-time communication into a single, easy-to-use web application.

Whether you run a small tutoring center or a growing language school with hundreds of students, ESL Booking System gives you the tools to manage every aspect of your operation — from registering students and assigning teachers, to scheduling recurring classes, sending announcements, and tracking progress over time.

### Key Value Propositions

- **All-in-one platform** — no need for separate scheduling, communication, or payment tools
- **Multi-company support** — each school operates in its own isolated environment
- **Role-based access** — students, teachers, and admins each see exactly what they need
- **Real-time updates** — instant notifications via the web and push alerts on mobile
- **Installable as an app** — works as a Progressive Web App (PWA) on any device
- **Timezone-aware** — designed for international use with timezone management built in
- **Bulk tools** — import hundreds of students or teachers at once via CSV
- **Fully auditable** — every admin action is logged for accountability

---

## 2. Who It's For

| Audience | Description |
|---|---|
| **ESL Schools & Language Centers** | Manage classes, teachers, students, and payments in one place |
| **Private Tutoring Companies** | Offer structured packages and track student progress |
| **Online English Academies** | Schedule and run remote sessions with meeting links |
| **Hybrid Learning Centers** | Support both online and in-person class modes |
| **Franchise Operations** | Each branch runs as its own company under the platform |

---

## 3. Core Features

### Scheduling & Booking
- Students book 1-on-1 sessions with assigned teachers
- Real-time availability calendar showing open and closed timeslots
- Multi-slot booking for longer sessions
- Recurring class schedules (weekly, multi-week)
- Admin-controlled slot opening and closing
- Waitlist system when preferred slots are full

### Student Management
- Student profiles with guardian info, nationality, age, and timezone
- Tutorial package assignment and session tracking
- Absence tracking for both students and teachers
- Feedback submission after each class

### Teacher Management
- Teacher profiles with bio, timezone, and schedule
- Flexible availability management — open and close timeslots per teacher
- Leave request system
- Class report submission after every completed session

### Package & Payment System
- Create unlimited tutorial packages with custom names, session limits, pricing, and subjects
- Assign packages to individual students
- Track payment status: pending, paid, or expired
- Attach receipt images and transaction reference numbers

### Communication & Notifications
- In-app notification bell with real-time socket updates
- Web push notifications (works even when the browser is closed)
- Announcement board for admins to broadcast to students, teachers, or everyone
- Pin important announcements and set expiry dates

### Assignments & Grading
- Teachers create assignments linked to classes
- Students submit text responses and reference links
- Teachers grade submissions and provide feedback
- Track assignment status: active, submitted, graded

### Reporting & Analytics
- Company admin dashboard with student, teacher, booking, and feedback stats
- Class reports submitted by teachers after each session
- Activity logs and audit trails
- CSV export for student and booking data
- Super admin platform-wide analytics

### Multi-Language Support
- Built-in internationalization (i18n) framework
- Language toggle available in the UI
- Easily extendable to additional languages

### Progressive Web App (PWA)
- Installable on iOS, Android, Windows, and macOS
- Works offline (cached assets)
- Push notifications even when the app is not open
- App update prompts when new versions are deployed

---

## 4. User Roles & Permissions

The platform uses a strict role-based access control system. Every user belongs to one of four roles, each with a defined set of capabilities.

### Role Hierarchy

```
Super Admin (platform-wide)
    └── Company Admin (company-wide)
            ├── Teacher (class-level)
            └── Student (personal)
```

### Role Comparison Table

| Capability | Student | Teacher | Company Admin | Super Admin |
|---|:---:|:---:|:---:|:---:|
| Book classes | ✅ | | | |
| View own schedule | ✅ | ✅ | | |
| Submit feedback | ✅ | | | |
| Complete assignments | ✅ | | | |
| Join waitlist | ✅ | | | |
| View assigned students | | ✅ | ✅ | |
| Submit class reports | | ✅ | | |
| Create assignments | | ✅ | | |
| Request leave | | ✅ | | |
| Manage timeslots | | ✅ | ✅ | |
| Add/edit students | | | ✅ | |
| Add/edit teachers | | | ✅* | |
| Create packages | | | ✅ | |
| View company stats | | | ✅ | |
| Send announcements | | | ✅ | ✅ |
| Manage subscription | | | ✅ (owner) | ✅ |
| View all companies | | | | ✅ |
| Create subscription plans | | | | ✅ |
| Lock/suspend companies | | | | ✅ |

*\*Company admins can be granted granular teacher management permissions by the company owner.*

### Admin Permission Granularity

Company admins (non-owners) can be granted specific permissions:
- **Can Add Teacher** — invite and onboard new teachers
- **Can Edit Teacher** — update teacher profiles and availability
- **Can Delete Teacher** — deactivate teacher accounts

---

## 5. Feature Walkthrough by Role

### 5.1 Student Experience

#### Dashboard
Upon login, students land on their personal dashboard showing:
- **Active Packages** — session counts, payment status, and assigned teacher
- **Upcoming Bookings** — date, time, teacher, and class mode (online/offline)
- **Absence Summary** — personal attendance record
- **Recent Feedback** — history of submitted class feedback
- **Announcements** — latest messages from the school

#### Booking a Class
1. Select an active package
2. View the teacher's open timeslots on the weekly calendar
3. Choose a date and time slot (multi-slot selection for longer sessions)
4. Confirm the booking — the class is immediately scheduled
5. Receive a confirmation notification

#### Waitlist
If a preferred timeslot is not available:
1. Join the waitlist for that date and time
2. Receive an automatic notification when the slot opens up
3. Book immediately from the notification

#### Assignments
- View all assignments from teachers with due dates and instructions
- Submit responses and attach reference links
- Receive scores and feedback from the teacher

#### Profile Management
- Update display name, contact details, and timezone
- View guardian information (for minor students)

---

### 5.2 Teacher Experience

#### Dashboard
The teacher dashboard provides:
- **Assigned Students** — list of current students with package info
- **Today's Schedule** — upcoming classes for the day
- **Upcoming Bookings** — full calendar view of scheduled sessions
- **Completed Classes** — history for report submission
- **Leave Requests** — status of submitted leave applications

#### Managing Availability
- Open or close specific timeslots on the weekly calendar
- Slots can be managed day by day and hour by hour
- Closed slots are not visible to students for booking

#### After a Class
1. Mark the booking as **Done**
2. Submit a **Class Report** — record new vocabulary, sentences, notes, and remarks
3. Optionally create an **Assignment** linked to the class
4. Log any absences (teacher or student)

#### Assignments
- Create assignments with title, instructions, due date, and optional resource links
- View all student submissions
- Grade submissions with a numeric score and written feedback

#### Leave Requests
- Submit a leave request for specific dates
- Admin reviews and approves/rejects the request
- Approved leave blocks the teacher's timeslots automatically

---

### 5.3 Company Admin Experience

#### Admin Dashboard
A high-level view of company activity:
- **Key Metrics** — total students, teachers, active packages, completed classes
- **Recent Bookings** — latest activity across the company
- **Student Feedback** — recent ratings and comments
- **Student List** — quick access to all students

#### Student Management
- Add students individually or via CSV bulk import
- View complete student profiles including packages, bookings, absences, and feedback
- Edit student information and guardian details
- Deactivate students who are no longer active
- Export student data as CSV

#### Teacher Management
- Add teachers individually or via CSV bulk import
- View teacher profiles including schedule, assigned students, and class history
- Edit teacher bios and contact info
- Manage teacher availability and timeslots
- Deactivate teachers

#### Package Setup
Create tutorial packages with:
- **Package Name** — e.g., "Intermediate English – 20 Sessions"
- **Session Limit** — total number of classes included
- **Price & Currency** — for payment reference
- **Subject** — e.g., Conversational English, Business English, IELTS Prep
- **Duration** — session length in minutes
- **Description** — additional details shown to students

#### Timeslot Management
- Open or close any teacher's timeslots directly from the admin panel
- Block out holidays, special events, or unavailable periods

#### Recurring Schedule Creation
Set up a recurring class series for a student:
- Select teacher and student
- Choose days of the week
- Set start time and session duration
- Define the number of weeks
- The system auto-generates all bookings in one step

#### Announcements
- Write and publish announcements to specific audiences (students, teachers, or everyone)
- Pin critical announcements to the top
- Set expiry dates for time-sensitive messages

#### Company Profile
- Update company name, contact email, phone, and address
- Manage subscription plan and billing
- View payment history

---

### 5.4 Super Admin Experience

The Super Admin has a god-view of the entire platform — across all companies.

#### Platform Dashboard
- Total number of companies, students, teachers, and admins
- Active subscription plan breakdown
- System-wide activity metrics

#### Company Management
- View all registered companies with status indicators (active, trial, locked, suspended)
- Change company status: activate, lock for non-payment, or suspend for violations
- View company details and contact information

#### Subscription Plan Management
Create and manage the plans that companies purchase:
- **Plan Name** — e.g., Starter, Growth, Enterprise
- **Max Students / Teachers / Admins** — enforced limits
- **Monthly Price** — shown on the public pricing page
- **Description** — marketing copy for each tier
- Enable or disable plans from the public listing

---

## 6. Booking & Scheduling System

### How Bookings Work

1. **Timeslot Availability** — Teachers define their open hours. Admins can also open/close slots.
2. **Package-Based Booking** — Students can only book within an active, assigned package.
3. **Session Deduction** — Each confirmed booking deducts one session from the package balance.
4. **Auto-Confirmation** — Bookings are immediately confirmed upon creation (no manual approval required).
5. **Race Condition Protection** — Database-level locking ensures two students cannot book the same slot simultaneously.

### Booking Statuses

| Status | Meaning |
|---|---|
| `confirmed` | Class is scheduled and active |
| `done` | Class was completed by the teacher |
| `cancelled` | Booking was cancelled (by student or admin) |
| `rejected` | Booking was rejected by admin |

### Multi-Slot Bookings
For sessions longer than one standard slot, students can select multiple consecutive time blocks. These are grouped under a single booking reference for easy management.

### Absence Tracking
- **Teacher Absence** — teacher marks themselves absent; the session is not charged against the student's package
- **Student Absence** — teacher or admin marks the student absent; the session is still counted

### Cancellations
- Students can cancel upcoming bookings
- The session is returned to the package balance if cancelled before the class

### Rescheduling
Admins can reschedule bookings and the system flags them as `rescheduled_by_admin` for reporting transparency.

---

## 7. Package & Payment Management

### Tutorial Packages
Tutorial packages define what a student is purchasing. Each package specifies:
- How many sessions are included
- Which subject (e.g., General English, Business, IELTS)
- Session duration in minutes
- Price (for reference/invoicing)
- Currency

### Student Package Assignment
When a student is assigned a package:
- A **student_package** record is created linking the student, package, and teacher
- The payment status starts as **pending** until confirmed by admin
- The admin can attach a receipt image and transaction reference number

### Payment Statuses

| Status | Meaning |
|---|---|
| `pending` | Package assigned, awaiting payment confirmation |
| `paid` | Payment confirmed — student can book classes |
| `expired` | Package has ended or been manually expired |

### Session Counting
The system tracks `sessions_remaining` in real time, accounting for:
- Completed (done) bookings
- Upcoming confirmed bookings (to prevent over-booking)
- Cancelled bookings (session restored)

---

## 8. Notifications & Communication

### Three-Channel Delivery
Every important event triggers notifications through up to three channels simultaneously:

1. **In-App Bell** — the notification icon in the navigation bar shows a live count of unread alerts. Clicking it opens the full notification list.
2. **Real-Time Socket** — new notifications appear instantly without a page refresh, powered by Socket.io.
3. **Web Push** — even with the browser closed or the app in the background, push notifications appear on the user's device (desktop or mobile).

### Notification Types
- New booking created
- Booking cancelled or status changed
- New assignment created or graded
- Payment reminder
- Waitlist slot opened
- Announcement published
- Leave request approved/rejected

### Announcements
Admins can broadcast announcements to:
- All students in the company
- All teachers in the company
- Company admins only
- Everyone

Announcements can be **pinned** to stay at the top and can have an **expiry date** after which they are automatically hidden.

---

## 9. Assignments & Progress Tracking

### Teacher Workflow
1. After completing a class, the teacher creates an assignment linked to that session
2. Sets a title, instructions, optional resource links, due date, and maximum score
3. The assignment is immediately visible to the assigned student

### Student Workflow
1. Student views the assignment on their dashboard
2. Writes a response and optionally adds reference links
3. Submits before the due date (late submissions are flagged)

### Grading
1. Teacher opens the submissions list for the assignment
2. Scores the submission out of the maximum score
3. Writes written feedback for the student
4. Student is notified and can view their grade

### Class Reports
After every completed booking, teachers submit a class report containing:
- **New Words** — vocabulary introduced in the session
- **Sentences** — example sentences practiced
- **Notes** — general class observations
- **Remarks** — private notes for admin/record keeping

These reports are stored per booking and are accessible to company admins.

---

## 10. Recurring Schedules

For students with a regular weekly schedule, admins can create a recurring class series instead of booking individual sessions.

### Setup
- Select the student's active package and assigned teacher
- Choose one or more days of the week (e.g., Monday, Wednesday, Friday)
- Set the start time and session duration
- Define the number of weeks to generate
- Choose the series start date

### Auto-Generation
The system automatically creates individual bookings for every occurrence across the full schedule duration. Each booking appears on both the student's and teacher's calendars.

### Flexibility
- **Skip a Date** — exclude specific dates (holidays, school breaks) without canceling the whole series
- **Cancel Series** — cancel all future bookings in the series at once
- **Edit Series** — modify timing or teacher for future sessions

---

## 11. Bulk Import & Export

### Bulk Import (CSV)
Admins can onboard large numbers of users in one step by uploading a formatted CSV file.

**Supported import types:**
- Students
- Teachers

**The import process:**
1. Prepare a CSV file with the required columns
2. Upload the file on the Bulk Import page
3. The system validates each row, checks for duplicate emails, and enforces plan limits
4. A detailed import log is returned showing:
   - Rows successfully imported
   - Rows skipped (duplicates or over-limit)
   - Row-by-row error details

Imported users receive a welcome email with instructions to set their password.

### Export (CSV)
Admins can export data for reporting or external processing:
- **Student Export** — full student list with profile fields
- **Booking Export** — booking history with dates, statuses, teacher names, and session details

---

## 12. Platform Administration

### Company Lifecycle

| Status | Description |
|---|---|
| `active` | Company has a valid subscription and full access |
| `trial` | Company is within the free trial period |
| `locked` | Access restricted — typically due to overdue payment |
| `suspended` | Account suspended by the platform operator |
| `pending` | Newly registered, awaiting activation |

When a company is **locked**, users see a dedicated lock page and cannot access the platform until the admin resolves the billing issue. When **suspended**, a suspension notice is shown.

### Subscription Plan Enforcement
The platform enforces plan limits at the point of user creation:
- Cannot add more students than the plan's `max_students` limit
- Cannot add more teachers than the plan's `max_teachers` limit
- Cannot add more admins than the plan's `max_admins` limit

Upgrading the subscription plan immediately raises these limits.

### Audit Logs
Every significant admin action is recorded in the audit log:
- Who performed the action
- What they did (add user, deactivate teacher, change status, etc.)
- When it happened
- The target record and any changed details

This provides full accountability for all administrative activity.

### Company Payments
Admins record manual payments against their account:
- Payment amount and date
- Billing period covered
- Notes and the admin who recorded it

A full payment history is available for billing reference.

---

## 13. Security & Privacy

### Authentication
- All passwords are hashed using **bcrypt** — raw passwords are never stored
- Authentication uses **JSON Web Tokens (JWT)** — tokens expire and must be renewed
- Rate limiting protects login and registration endpoints from brute-force attacks:
  - Registration: 20 attempts per hour per IP
  - Password reset: 5 attempts per hour per IP

### Data Isolation
Every company's data is completely isolated. Users can only access records belonging to their own company. There is no way for a student, teacher, or admin from Company A to see data from Company B.

### Network Security
- HTTPS enforced in production with **Strict-Transport-Security** headers
- **CORS** restricted to the registered frontend URL only
- Security headers applied on every response:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY` (prevents clickjacking)
  - `X-XSS-Protection: 1; mode=block`

### Database Security
- All database queries use **parameterized statements** — SQL injection is not possible
- Database credentials are stored in environment variables, never in code
- Connection pooling limits concurrent database load

### Error Handling
- Internal server errors never expose stack traces or database details to the client
- All errors are logged internally via **Winston** and optionally to **Sentry** for alerting

---

## 14. Technical Architecture

### Tech Stack

#### Backend
| Component | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express.js |
| Database | MySQL (compatible with TiDB Cloud) |
| Real-Time | Socket.io |
| Authentication | JWT (jsonwebtoken) + bcrypt |
| Email | Nodemailer (SMTP) |
| Push Notifications | web-push (VAPID) |
| File Uploads | Multer |
| Scheduling | node-cron |
| Logging | Winston |
| Error Tracking | Sentry |
| CSV Parsing | csv-parse |

#### Frontend
| Component | Technology |
|---|---|
| Framework | React 19 |
| Language | TypeScript |
| Build Tool | Vite |
| Styling | Tailwind CSS 4 |
| UI Components | shadcn / Radix UI |
| Routing | React Router v7 |
| HTTP Client | Axios |
| Real-Time | Socket.io Client |
| Date Handling | date-fns + date-fns-tz |
| Charts | Recharts |
| Calendar | react-calendar |
| Icons | Lucide React |
| Internationalization | i18next |
| PWA | vite-plugin-pwa |
| Error Tracking | Sentry |

### System Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Client (Browser / PWA)               │
│              React 19 + TypeScript + Vite                │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTPS + WebSocket
┌───────────────────────▼─────────────────────────────────┐
│                  Express.js REST API                     │
│         Node.js · JWT Auth · Role Middleware             │
│         Socket.io · node-cron · Multer                   │
└───────────────────────┬─────────────────────────────────┘
                        │ MySQL Protocol (TLS)
┌───────────────────────▼─────────────────────────────────┐
│                    MySQL Database                        │
│         TiDB Cloud / Hosted MySQL · Connection Pool      │
└─────────────────────────────────────────────────────────┘
```

### Database Tables

| Table | Purpose |
|---|---|
| `users` | All users across all roles and companies |
| `companies` | Company accounts with subscription and status |
| `subscription_plans` | Available tiers (created by super admin) |
| `tutorial_packages` | Package templates created by company admins |
| `student_packages` | Individual package assignments per student |
| `bookings` | All scheduled and completed classes |
| `closed_slots` | Timeslots blocked by teachers or admins |
| `recurring_schedules` | Recurring class series with auto-booking |
| `class_reports` | Post-class reports submitted by teachers |
| `assignments` | Assignments created by teachers |
| `assignment_submissions` | Student submissions and grades |
| `notifications` | In-app notification records |
| `push_subscriptions` | Web push subscription endpoints |
| `announcements` | Company-wide broadcast messages |
| `announcement_reads` | Read receipts per announcement per user |
| `waitlist` | Student waitlist entries for full timeslots |
| `admin_permissions` | Granular permission overrides for admins |
| `audit_logs` | Full record of admin actions |
| `company_payments` | Payment history per company |
| `bulk_import_logs` | CSV import results and error details |

### Timezone Handling
The system stores appointment times as wall-clock values in **Philippine Time (PHT, UTC+8)**. The frontend uses `date-fns-tz` to convert and display times correctly based on the logged-in user's timezone setting. This ensures that a booking made at 3:00 PM Manila time displays correctly regardless of where the teacher or student is located.

### Scheduled Background Jobs
A `node-cron` scheduler runs automated tasks at defined intervals:
- **Trial Expiry Check** — locks companies whose free trial has ended
- **Billing Reminders** — sends payment reminder notifications when due dates approach
- **Recurring Booking Generation** — creates future bookings for active recurring schedules

---

## 15. Deployment & Hosting

### Deployment Platform
The application is deployed via **Vercel** for the frontend, with the backend hosted on a Node.js-compatible cloud platform. The database is hosted on a managed MySQL-compatible service (TiDB Cloud or similar).

### Environment Requirements

#### Backend Environment Variables

| Variable | Description |
|---|---|
| `NODE_ENV` | `production` or `development` |
| `PORT` | Server port (default: 5000) |
| `DB_HOST` | MySQL host |
| `DB_USER` | MySQL username |
| `DB_PASS` | MySQL password |
| `DB_NAME` | Database name |
| `DB_PORT` | MySQL port (default: 3306) |
| `DB_SSL` | Enable SSL for DB connection (`true`/`false`) |
| `JWT_SECRET` | Secret key for JWT signing (min. 32 characters) |
| `FRONTEND_URL` | Full URL of the frontend (for CORS) |
| `SMTP_HOST` | Email server hostname |
| `SMTP_PORT` | Email server port |
| `SMTP_USER` | SMTP username / email address |
| `SMTP_PASS` | SMTP password |
| `SMTP_FROM` | Sender email address |
| `VAPID_PUBLIC_KEY` | Web push VAPID public key |
| `VAPID_PRIVATE_KEY` | Web push VAPID private key |
| `VAPID_SUBJECT` | Web push contact email (`mailto:...`) |
| `SENTRY_DSN` | (Optional) Sentry error tracking DSN |
| `LOG_LEVEL` | Logging verbosity (`info`, `debug`, `error`) |

#### Frontend Environment Variables

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | Full URL of the backend API |
| `VITE_SENTRY_DSN` | (Optional) Sentry DSN for frontend error tracking |

### Database Migration
The database schema is **automatically migrated** on server startup. New tables and columns are created idempotently — there is no need to run manual migration scripts. This makes deployments and environment setup straightforward.

### Health Check
The backend exposes a `GET /health` endpoint that returns the server status. This is used by hosting platforms for uptime monitoring and load balancer health checks.

---

## 16. Frequently Asked Questions

**Q: Can multiple companies use the platform at the same time?**  
Yes. The platform is fully multi-tenant. Each company has its own isolated environment with separate students, teachers, data, and settings.

**Q: Is the platform accessible on mobile devices?**  
Yes. The frontend is fully responsive and can be installed as a Progressive Web App (PWA) on iOS, Android, Windows, and macOS — giving it a native app-like experience.

**Q: How does the booking system prevent double-booking?**  
The booking system uses database-level row locking during the booking transaction. This guarantees that two students cannot claim the same slot simultaneously, even under heavy concurrent load.

**Q: Can teachers manage their own schedule?**  
Yes. Teachers can open and close their own timeslots directly from their dashboard. Company admins can also manage timeslots on behalf of teachers.

**Q: What happens when a student runs out of sessions?**  
Once all sessions in a package are used, the student cannot book new classes until the admin assigns a new package. The session count includes both completed and upcoming bookings.

**Q: Can the system send email notifications?**  
Yes. Transactional emails are sent via SMTP for events like password resets, new user invitations, and payment reminders. The SMTP server is configurable per deployment.

**Q: Is student data kept private between teachers?**  
Yes. Teachers can only see students who are directly assigned to them. A teacher cannot view another teacher's student list or booking history.

**Q: How does the waitlist work?**  
When a student tries to book a timeslot that is unavailable, they can join the waitlist for that slot. When the slot becomes available (e.g., a cancellation), all students on the waitlist are automatically notified and can book immediately.

**Q: What subscription plans are available?**  
Subscription plans (including max user limits and pricing) are created and managed by the Super Admin. Each company selects a plan at registration. Plans can be upgraded at any time through the company admin panel.

**Q: Can we import existing students and teachers from a spreadsheet?**  
Yes. The platform supports CSV bulk import for both students and teachers. The import provides row-by-row success/error reporting so you know exactly what was imported and what needs attention.

**Q: How are recurring classes handled if there's a holiday?**  
Recurring schedules support date-skipping. Admins can skip specific dates in a recurring series without canceling the entire schedule. This is ideal for managing public holidays and school breaks.

**Q: What languages does the platform support?**  
The frontend has a built-in internationalization (i18n) framework and includes a language toggle. English is the primary language, with additional languages extendable through translation files.

---

*ESL Booking System — Built for language schools, powered for growth.*
