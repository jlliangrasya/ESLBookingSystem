# ESL Booking System

A full-featured, cloud-based management platform built for ESL (English as a Second Language) tutoring companies. Manage students, teachers, class bookings, packages, payments, and real-time communication — all in one place.

---

## Features

### For Students
- Book 1-on-1 sessions with assigned teachers via a live availability calendar
- View session counts, payment status, and upcoming classes on a personal dashboard
- Join a waitlist for full timeslots and get notified automatically when they open
- Submit and receive graded assignments with teacher feedback
- Track personal attendance and submit post-class feedback

### For Teachers
- Manage weekly availability by opening and closing individual timeslots
- View assigned students, upcoming sessions, and completed class history
- Submit post-class reports (new vocabulary, sentences, notes, remarks)
- Create and grade assignments linked to specific sessions
- Submit leave requests

### For Company Admins
- Add, edit, and deactivate students and teachers individually or via CSV bulk import
- Create tutorial packages with custom session limits, subjects, pricing, and duration
- Set up recurring class schedules that auto-generate all bookings
- Broadcast announcements to students, teachers, or everyone — with pin and expiry support
- Export student and booking data as CSV
- View company-wide stats, feedback, and activity logs

### Platform-Wide
- Real-time notifications via in-app bell, Socket.io, and web push (PWA)
- Role-based access control with full company data isolation
- Recurring schedules with skip-date support for holidays and breaks
- Timezone-aware scheduling with per-user display preferences
- Multi-language UI via i18next (language toggle built in)
- Installable as a Progressive Web App (PWA) on any device
- Full audit log of all admin actions

---

## Tech Stack

| Layer | Technologies |
|---|---|
| **Backend** | Node.js, Express.js, MySQL, Socket.io, JWT, Nodemailer, web-push, node-cron, Winston, Sentry |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS 4, shadcn/Radix UI, React Router v7, Axios, Recharts, date-fns, i18next |
| **Database** | MySQL 8 / TiDB Cloud |
| **Deployment** | Vercel (frontend), Node.js host (backend) |

---

## Project Structure

```
esl-booking-system/
├── backend/
│   ├── server.js           # Entry point, auto DB migration, Socket.io
│   ├── db.js               # MySQL connection pool
│   ├── middleware/         # Auth, role guards, rate limiting
│   └── routes/             # REST API — bookings, students, teachers, admin, ...
└── frontend/
    ├── src/
    │   ├── pages/          # Route-level page components
    │   ├── components/     # Shared UI and feature components
    │   ├── context/        # Auth context (JWT)
    │   └── utils/          # Timezone helpers, API client
    └── public/             # PWA manifest and icons
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- MySQL 8+ (or TiDB Cloud)

### 1. Clone the repository

```bash
git clone https://github.com/your-username/esl-booking-system.git
cd esl-booking-system
```

### 2. Set up the backend

```bash
cd esl-booking-system/backend
cp .env.example .env   # then edit with your values
npm install
npm start
```

Key `.env` variables:

```env
NODE_ENV=development
PORT=5000

DB_HOST=localhost
DB_USER=root
DB_PASS=yourpassword
DB_NAME=esl_booking
DB_PORT=3306
DB_SSL=false

JWT_SECRET=your_jwt_secret_minimum_32_characters

FRONTEND_URL=http://localhost:5173

SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=you@example.com
SMTP_PASS=yourpassword
SMTP_FROM=you@example.com

VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_SUBJECT=mailto:admin@example.com
```

> The database schema is created automatically on first startup — no manual migrations needed.

### 3. Set up the frontend

```bash
cd ../frontend
cp .env.example .env   # set VITE_API_BASE_URL=http://localhost:5000
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

---

## User Roles

| Role | Access |
|---|---|
| `student` | Personal dashboard, bookings, assignments, feedback |
| `teacher` | Assigned students, schedule management, reports, assignments |
| `company_admin` | Full company management — students, teachers, packages, announcements |
| `super_admin` | Platform-wide — all companies, subscription plans, billing status |

---

## Deployment

The frontend deploys via **Vercel** (pushes to `main` may auto-deploy). The backend runs on any Node.js-compatible host. The database is hosted on a managed MySQL service such as TiDB Cloud.

---

## License

This project is proprietary. All rights reserved.
