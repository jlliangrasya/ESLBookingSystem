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

const app = express();
const httpServer = http.createServer(app);

// Allowed origins: strict in production; wildcard only for local dev
const allowedOrigin = process.env.FRONTEND_URL || (process.env.NODE_ENV !== 'production' ? '*' : null);
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

// Ensure push_subscriptions table exists (lightweight, idempotent)
pool.query(`
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    endpoint VARCHAR(500) NOT NULL,
    p256dh VARCHAR(255) NOT NULL,
    auth VARCHAR(255) NOT NULL,
    user_agent VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_endpoint (endpoint),
    INDEX idx_push_user (user_id)
  )
`).then(() => logger.info('push_subscriptions table ensured'))
  .catch((err) => logger.error('Failed to ensure push_subscriptions table', { error: err.message }));

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
