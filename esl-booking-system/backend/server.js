const Sentry = require('@sentry/node');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
require('dotenv').config();
// bodyParser removed — express.json() is sufficient

const logger = require('./utils/logger');
const { setIO } = require('./socket');

// ── Sentry — must init before any other requires ──────────────────────────────
Sentry.init({
    dsn: process.env.SENTRY_DSN || '',          // leave empty to disable
    environment: process.env.NODE_ENV || 'development',
    enabled: !!process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
});
// ─────────────────────────────────────────────────────────────────────────────

// ── Startup security checks ──────────────────────────────────────────────────
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    logger.error('FATAL: JWT_SECRET must be set and at least 32 characters long.');
    process.exit(1);
}
if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) {
    logger.error('FATAL: FRONTEND_URL must be set in production.');
    process.exit(1);
}
// ─────────────────────────────────────────────────────────────────────────────

const authRoutes = require('./routes/authRoutes');
const packageRoutes = require('./routes/packageRoutes.js');
const bookingRoutes = require('./routes/bookingRoutes.js');
const studentRoutes = require('./routes/studentRoutes.js');
const adminRoutes = require('./routes/adminRoutes.js');
const companyRoutes = require('./routes/companyRoutes.js');
const superAdminRoutes = require('./routes/superAdminRoutes.js');
const teacherRoutes = require('./routes/teacherRoutes.js');
const notificationRoutes = require('./routes/notificationRoutes.js');
const reportRoutes = require('./routes/reportRoutes.js');
const waitlistRoutes = require('./routes/waitlistRoutes.js');
const exportRoutes = require('./routes/exportRoutes.js');
const pushRoutes = require('./routes/pushRoutes.js');
const announcementRoutes = require('./routes/announcementRoutes.js');
const importRoutes = require('./routes/importRoutes.js');
const assignmentRoutes = require('./routes/assignmentRoutes.js');
const recurringRoutes = require('./routes/recurringRoutes.js');

const app = express();
const httpServer = http.createServer(app);

// Allowed origins: strict in production; wildcard only for local dev
// FRONTEND_URL can be comma-separated to support multiple origins (e.g. during migration)
const rawOrigin = process.env.FRONTEND_URL || (process.env.NODE_ENV !== 'production' ? '*' : null);
const allowedOrigin = rawOrigin && rawOrigin !== '*'
    ? rawOrigin.split(',').map(s => s.trim())
    : rawOrigin;
if (process.env.NODE_ENV === 'production' && !allowedOrigin) {
    logger.error('FATAL: FRONTEND_URL is required in production for CORS.');
    process.exit(1);
}

// Socket.io — real-time notifications
const io = new Server(httpServer, {
    cors: { origin: allowedOrigin, methods: ['GET', 'POST'] },
});
setIO(io);

io.on('connection', (socket) => {
    const token = socket.handshake.auth?.token;
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.join(`user:${decoded.id}`);
        } catch {
            socket.disconnect();
        }
    }
});

// CORS must be first so preflight OPTIONS requests get headers
app.use(cors({
    origin: allowedOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
// Issue #3: 2MB default for most endpoints; 10MB for receipt uploads
app.use(express.json({ limit: '2mb' }));

// Issue #4: Security headers to mitigate XSS and clickjacking
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
});

// Health check (no auth — used by Heroku, uptime monitors, load balancers)
const pool = require('./db');
app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok' });
    } catch {
        res.status(503).json({ status: 'error', message: 'Database unavailable' });
    }
});

// Higher body limit for receipt image uploads (base64)
app.use('/api/student/avail', express.json({ limit: '10mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/student', packageRoutes);
app.use(bookingRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/waitlist', waitlistRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/import', importRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/recurring', recurringRoutes);

// ── Auto-migrate: ensure all tables & columns exist (idempotent) ────────────
async function runAutoMigrations() {
  const migrations = [
    // push_subscriptions
    { name: 'push_subscriptions', sql: `CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, endpoint VARCHAR(500) NOT NULL,
        p256dh VARCHAR(255) NOT NULL, auth VARCHAR(255) NOT NULL, user_agent VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY uq_endpoint (endpoint), INDEX idx_push_user (user_id))` },
    // company_payments
    { name: 'company_payments', sql: `CREATE TABLE IF NOT EXISTS company_payments (
        id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, amount DECIMAL(10,2) NOT NULL,
        payment_date DATE NOT NULL, period_start DATE NULL, period_end DATE NULL, notes TEXT NULL,
        recorded_by INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (recorded_by) REFERENCES users(id))` },
    // announcements
    { name: 'announcements', sql: `CREATE TABLE IF NOT EXISTS announcements (
        id INT AUTO_INCREMENT PRIMARY KEY, company_id INT DEFAULT NULL, author_id INT NOT NULL,
        title VARCHAR(255) NOT NULL, content TEXT NOT NULL,
        audience ENUM('company_admin','teachers','students','all') NOT NULL DEFAULT 'all',
        is_pinned TINYINT(1) DEFAULT 0, expires_at TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
        FOREIGN KEY (author_id) REFERENCES users(id),
        INDEX idx_ann_company_audience (company_id, audience, created_at),
        INDEX idx_ann_expires (expires_at))` },
    // announcement_reads
    { name: 'announcement_reads', sql: `CREATE TABLE IF NOT EXISTS announcement_reads (
        id INT AUTO_INCREMENT PRIMARY KEY, announcement_id INT NOT NULL, user_id INT NOT NULL,
        read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY uq_ann_user (announcement_id, user_id), INDEX idx_annread_user (user_id))` },
    // bulk_import_logs
    { name: 'bulk_import_logs', sql: `CREATE TABLE IF NOT EXISTS bulk_import_logs (
        id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, imported_by INT NOT NULL,
        import_type ENUM('teachers','students') NOT NULL, total_rows INT NOT NULL DEFAULT 0,
        success_count INT NOT NULL DEFAULT 0, skipped_count INT NOT NULL DEFAULT 0,
        error_details JSON NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (imported_by) REFERENCES users(id),
        INDEX idx_bil_company (company_id, created_at))` },
    // assignments
    { name: 'assignments', sql: `CREATE TABLE IF NOT EXISTS assignments (
        id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, teacher_id INT NOT NULL,
        student_id INT NOT NULL, booking_id INT DEFAULT NULL, title VARCHAR(255) NOT NULL,
        instructions TEXT NOT NULL, due_date DATETIME NOT NULL, max_score INT DEFAULT NULL,
        resource_links JSON NULL, status ENUM('active','closed') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (teacher_id) REFERENCES users(id),
        FOREIGN KEY (student_id) REFERENCES users(id),
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
        INDEX idx_assign_teacher (company_id, teacher_id),
        INDEX idx_assign_student (student_id, status), INDEX idx_assign_due (due_date))` },
    // assignment_submissions
    { name: 'assignment_submissions', sql: `CREATE TABLE IF NOT EXISTS assignment_submissions (
        id INT AUTO_INCREMENT PRIMARY KEY, assignment_id INT NOT NULL, student_id INT NOT NULL,
        response_text TEXT NOT NULL, reference_links JSON NULL, is_late TINYINT(1) DEFAULT 0,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, score INT DEFAULT NULL,
        feedback TEXT DEFAULT NULL, graded_at TIMESTAMP NULL DEFAULT NULL, graded_by INT DEFAULT NULL,
        FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES users(id),
        FOREIGN KEY (graded_by) REFERENCES users(id),
        UNIQUE KEY uq_submission (assignment_id, student_id))` },
    // recurring_schedules
    { name: 'recurring_schedules', sql: `CREATE TABLE IF NOT EXISTS recurring_schedules (
        id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, student_package_id INT NOT NULL,
        teacher_id INT NOT NULL, student_id INT NOT NULL, days_of_week JSON NOT NULL,
        start_time TIME NOT NULL, duration_minutes INT NOT NULL, slots_per_class INT NOT NULL,
        num_weeks INT NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL,
        total_possible INT NOT NULL, sessions_booked INT NOT NULL, skipped_dates JSON NULL,
        status ENUM('active','cancelled','completed') DEFAULT 'active',
        created_by INT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        cancelled_at TIMESTAMP NULL DEFAULT NULL,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (student_package_id) REFERENCES student_packages(id),
        FOREIGN KEY (teacher_id) REFERENCES users(id),
        FOREIGN KEY (student_id) REFERENCES users(id),
        FOREIGN KEY (created_by) REFERENCES users(id),
        INDEX idx_rs_company (company_id, status),
        INDEX idx_rs_teacher (teacher_id, status), INDEX idx_rs_student (student_id))` },
  ];

  for (const m of migrations) {
    try { await pool.query(m.sql); } catch (err) {
      logger.error(`Migration ${m.name} failed`, { error: err.message });
    }
  }

  // Add columns to companies (safe: ignores if already exist)
  const addCols = [
    ["company_name", "VARCHAR(255) NOT NULL DEFAULT ''"],
    ["company_email", "VARCHAR(255) NOT NULL DEFAULT ''"],
    ["company_phone", "VARCHAR(50) NULL"],
    ["company_address", "TEXT NULL"],
  ];
  for (const [col, def] of addCols) {
    try { await pool.query(`ALTER TABLE companies ADD COLUMN ${col} ${def}`); }
    catch (err) { if (!err.message.includes('Duplicate column')) logger.error(`Add column ${col} failed`, { error: err.message }); }
  }

  // Add recurring_schedule_id to bookings
  try { await pool.query('ALTER TABLE bookings ADD COLUMN recurring_schedule_id INT DEFAULT NULL'); }
  catch (err) { if (!err.message.includes('Duplicate column')) logger.error('Add recurring_schedule_id failed', { error: err.message }); }

  // Backfill: copy old name/email into company_name/company_email if old columns exist
  try {
    const [[{ cnt }]] = await pool.query("SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'name'");
    if (cnt > 0) {
      await pool.query("UPDATE companies SET company_name = name WHERE company_name = '' AND name IS NOT NULL AND name != ''");
      await pool.query("UPDATE companies SET company_email = email WHERE company_email = '' AND email IS NOT NULL AND email != ''");
      await pool.query("UPDATE companies SET company_phone = phone WHERE company_phone IS NULL AND phone IS NOT NULL AND phone != ''");
      await pool.query("UPDATE companies SET company_address = address WHERE company_address IS NULL AND address IS NOT NULL AND address != ''");
      logger.info('Backfilled company_name/email/phone/address from old columns');
    }
  } catch { /* old columns don't exist — nothing to backfill */ }

  logger.info('Auto-migrations complete');
}
runAutoMigrations();

const { startScheduler } = require('./scheduler');
startScheduler();

// ── Sentry error handler (captures unhandled Express errors) ─────────────────
// Must be registered AFTER all routes, BEFORE custom error handler
Sentry.setupExpressErrorHandler(app);
// ─────────────────────────────────────────────────────────────────────────────

// ── Global error handler ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    logger.error('Unhandled error', { message: err.message, stack: err.stack, url: req.url, method: req.method });
    res.status(err.status || 500).json({ message: 'An unexpected error occurred.' });
});
// ─────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 5000;
const serverInstance = httpServer.listen(PORT, () => logger.info(`Server running on port ${PORT}`));

// ── Graceful shutdown ────────────────────────────────────────────────────────
const shutdown = (signal) => {
    logger.info(`${signal} received — shutting down gracefully`);
    serverInstance.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ── Catch unhandled promise rejections ──────────────────────────────────────
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled promise rejection', { reason: reason?.message || reason, stack: reason?.stack });
});
// ─────────────────────────────────────────────────────────────────────────────
