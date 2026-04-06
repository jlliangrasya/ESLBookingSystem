# PWA + Push Notifications — All Changes

This document contains every file that was created or modified to add Progressive Web App (PWA) support and Web Push Notifications to the Brightfolks ESL Booking System.

---

## Table of Contents

- [Before Deploying](#before-deploying)
- [New Backend Files](#new-backend-files)
  - [migrations/003_add_push_subscriptions.sql](#migrationsadd_push_subscriptionssql)
  - [utils/pushService.js](#utilspushservicejs)
  - [routes/pushRoutes.js](#routespushroutesjs)
- [Modified Backend Files](#modified-backend-files)
  - [utils/notify.js](#utilsnotifyjs)
  - [server.js](#serverjs)
- [New Frontend Files](#new-frontend-files)
  - [public/sw-push.js](#publicsw-pushjs)
  - [src/utils/pushNotifications.ts](#srcutilspushnotificationsts)
  - [src/hooks/usePWAInstall.ts](#srchooksusepwainstallts)
  - [src/hooks/usePushNotifications.ts](#srchooksusepushnotificationsts)
  - [src/components/InstallAppButton.tsx](#srccomponentsinstallappbuttontsx)
  - [src/components/PWAUpdatePrompt.tsx](#srccomponentspwaupdateprompttsx)
- [Modified Frontend Files](#modified-frontend-files)
  - [vite.config.ts](#viteconfigts)
  - [index.html](#indexhtml)
  - [src/vite-env.d.ts](#srcvite-envdts)
  - [src/App.tsx](#srcapptsx)
  - [src/components/Navbar.tsx](#srccomponentsnavbartsx)
  - [src/pages/Home.tsx](#srcpageshometsx)
  - [src/components/Login.tsx](#srccomponentslogintsx)
  - [src/context/AuthContext.tsx](#srccontextauthcontexttsx)
- [i18n Translation Files](#i18n-translation-files)
  - [en.json](#enjson)
  - [ko.json](#kojson)
  - [zh.json](#zhjson)
- [PWA Icon Assets](#pwa-icon-assets)
- [NPM Packages Added](#npm-packages-added)

---

## Before Deploying

1. **Run the SQL migration** on your database:
   ```
   mysql -u <user> -p <database> < backend/migrations/003_add_push_subscriptions.sql
   ```

2. **VAPID keys (already generated and added to `.env` files):**

   **Backend `.env`:**
   ```
   VAPID_PUBLIC_KEY=BATX-wdjdEM4-_-vbDBw33GzDdFBjntV-HARqdD9opFJDmUZkb9KgFwzSEvvbqYlRluFCSFc_04FVGn9mfP2s5M
   VAPID_PRIVATE_KEY=VNdhl1_PgSoyIkY4Drj0hWBEkbrbUNWQLTEMnxNiNPU
   VAPID_SUBJECT=mailto:jlliangracia.snaps@gmail.com
   ```

   **Frontend `.env`:**
   ```
   VITE_VAPID_PUBLIC_KEY=BATX-wdjdEM4-_-vbDBw33GzDdFBjntV-HARqdD9opFJDmUZkb9KgFwzSEvvbqYlRluFCSFc_04FVGn9mfP2s5M
   ```

   > To regenerate keys: `npx web-push generate-vapid-keys`

---

## New Backend Files

### `migrations/003_add_push_subscriptions.sql`

**Path:** `esl-booking-system/backend/migrations/003_add_push_subscriptions.sql`

```sql
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
);
```

---

### `utils/pushService.js`

**Path:** `esl-booking-system/backend/utils/pushService.js`

```js
const webpush = require('web-push');
const pool = require('../db');
const logger = require('./logger');

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:admin@brightfolks.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
}

function isConfigured() {
    return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

async function sendPushToUser(userId, { title, message, type }) {
    if (!isConfigured()) return;
    try {
        const [subscriptions] = await pool.query(
            'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
            [userId]
        );
        if (subscriptions.length === 0) return;

        const payload = JSON.stringify({ title, body: message, type });

        await Promise.allSettled(subscriptions.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                    payload
                );
            } catch (err) {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    await pool.query('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
                    logger.info('Removed stale push subscription', { subId: sub.id, userId });
                } else {
                    logger.error('Push send failed', { error: err.message, endpoint: sub.endpoint });
                }
            }
        }));
    } catch (err) {
        logger.error('sendPushToUser error', { error: err.message, userId });
    }
}

module.exports = { sendPushToUser, isConfigured };
```

---

### `routes/pushRoutes.js`

**Path:** `esl-booking-system/backend/routes/pushRoutes.js`

```js
const express = require('express');
const router = express.Router();
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');
const logger = require('../utils/logger');

// GET /api/push/vapid-public-key — no auth required
router.get('/vapid-public-key', (req, res) => {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
});

// POST /api/push/subscribe — register or update a push subscription
router.post('/subscribe', authenticateToken, async (req, res) => {
    try {
        const { endpoint, keys } = req.body;
        if (!endpoint || !keys?.p256dh || !keys?.auth) {
            return res.status(400).json({ message: 'Missing subscription data' });
        }

        await pool.query(
            `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth), user_agent = VALUES(user_agent)`,
            [req.user.id, endpoint, keys.p256dh, keys.auth, req.headers['user-agent'] || null]
        );

        res.status(201).json({ message: 'Subscribed' });
    } catch (err) {
        logger.error('Push subscribe error:', { error: err.message });
        res.status(500).json({ message: 'Failed to subscribe' });
    }
});

// DELETE /api/push/unsubscribe — remove a push subscription
router.delete('/unsubscribe', authenticateToken, async (req, res) => {
    try {
        const { endpoint } = req.body;
        if (!endpoint) {
            return res.status(400).json({ message: 'Missing endpoint' });
        }

        await pool.query(
            'DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?',
            [req.user.id, endpoint]
        );

        res.json({ message: 'Unsubscribed' });
    } catch (err) {
        logger.error('Push unsubscribe error:', { error: err.message });
        res.status(500).json({ message: 'Failed to unsubscribe' });
    }
});

module.exports = router;
```

---

## Modified Backend Files

### `utils/notify.js`

**Path:** `esl-booking-system/backend/utils/notify.js`

**Full file (with changes highlighted in comments):**

```js
const pool = require('../db');
const { getIO } = require('../socket');
const logger = require('./logger');
const { sendPushToUser } = require('./pushService'); // ← ADDED

/**
 * Create a notification in DB and emit it via socket.io to the recipient.
 * @param {object} opts
 * @param {number}  opts.userId     - recipient user ID
 * @param {number|null} opts.companyId - company context (NULL for super_admin)
 * @param {string}  opts.type      - e.g. 'new_company', 'new_student', 'booking_created'
 * @param {string}  opts.title     - short title shown in the bell
 * @param {string}  [opts.message] - optional longer description
 */
/**
 * Fire-and-forget: caller does NOT need to await this function.
 * DB insert and socket emit happen in the background; failures are logged but never block the caller.
 */
function notify({ userId, companyId = null, type, title, message = '' }) {
    // Intentionally not returning the promise — callers should not await
    (async () => {
        try {
            const [result] = await pool.query(
                'INSERT INTO notifications (user_id, company_id, type, title, message) VALUES (?, ?, ?, ?, ?)',
                [userId, companyId, type, title, message]
            );
            const [[row]] = await pool.query('SELECT * FROM notifications WHERE id = ?', [result.insertId]);

            const io = getIO();
            if (io) {
                io.to(`user:${userId}`).emit('notification', row);
            }

            sendPushToUser(userId, { title, message, type }); // ← ADDED
        } catch (err) {
            logger.error('Notify error:', { error: err.message, userId, type });
        }
    })();
}

module.exports = notify;
```

---

### `server.js`

**Path:** `esl-booking-system/backend/server.js`

**Full file:**

```js
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
const pushRoutes = require('./routes/pushRoutes.js'); // ← ADDED

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
app.use('/api/push', pushRoutes); // ← ADDED

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
// ─────────────────────────────────────────────────────────────────────────────
```

---

## New Frontend Files

### `public/sw-push.js`

**Path:** `esl-booking-system/frontend/public/sw-push.js`

```js
// sw-push.js — imported by the Workbox service worker via importScripts
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const title = data.title || 'Brightfolks';
  const options = {
    body: data.body || '',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: data.type || 'default',
    data: { url: '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
```

---

### `src/utils/pushNotifications.ts`

**Path:** `esl-booking-system/frontend/src/utils/pushNotifications.ts`

```ts
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getVapidPublicKey(): Promise<string | null> {
  if (import.meta.env.VITE_VAPID_PUBLIC_KEY) {
    return import.meta.env.VITE_VAPID_PUBLIC_KEY;
  }
  try {
    const res = await fetch(`${API_URL}/api/push/vapid-public-key`);
    const data = await res.json();
    return data.publicKey || null;
  } catch {
    return null;
  }
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function subscribeToPush(token: string): Promise<boolean> {
  if (!isPushSupported()) return false;

  const vapidKey = await getVapidPublicKey();
  if (!vapidKey) return false;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });

  const subJson = subscription.toJSON();
  await fetch(`${API_URL}/api/push/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      endpoint: subJson.endpoint,
      keys: subJson.keys,
    }),
  });

  return true;
}

export async function unsubscribeFromPush(token: string): Promise<void> {
  if (!isPushSupported()) return;
  try {
    // Timeout after 3s to prevent hanging if SW isn't ready
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await fetch(`${API_URL}/api/push/unsubscribe`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ endpoint }),
      });
    }
  } catch {
    // Silently fail — fire-and-forget
  }
}

export async function isPushSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}
```

---

### `src/hooks/usePWAInstall.ts`

**Path:** `esl-booking-system/frontend/src/hooks/usePWAInstall.ts`

```ts
import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    const handlePrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', handlePrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return outcome === 'accepted';
  }, [deferredPrompt]);

  return {
    canInstall: !!deferredPrompt && !isInstalled,
    isInstalled,
    install,
  };
}
```

---

### `src/hooks/usePushNotifications.ts`

**Path:** `esl-booking-system/frontend/src/hooks/usePushNotifications.ts`

```ts
import { useState, useEffect, useCallback } from 'react';
import { isPushSupported, isPushSubscribed, subscribeToPush, unsubscribeFromPush } from '@/utils/pushNotifications';

export function usePushNotifications(token: string | null) {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const supported = isPushSupported();

  useEffect(() => {
    if (!supported || !token) return;
    isPushSubscribed().then(setIsSubscribed);
  }, [supported, token]);

  const subscribe = useCallback(async () => {
    if (!token) return false;
    setIsLoading(true);
    try {
      const result = await subscribeToPush(token);
      setIsSubscribed(result);
      return result;
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const unsubscribe = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      await unsubscribeFromPush(token);
      setIsSubscribed(false);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  return { supported, isSubscribed, isLoading, subscribe, unsubscribe };
}
```

---

### `src/components/InstallAppButton.tsx`

**Path:** `esl-booking-system/frontend/src/components/InstallAppButton.tsx`

```tsx
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePWAInstall } from '@/hooks/usePWAInstall';

interface Props {
  variant?: 'white' | 'default';
}

const InstallAppButton: React.FC<Props> = ({ variant = 'default' }) => {
  const { t } = useTranslation();
  const { canInstall, install } = usePWAInstall();

  if (!canInstall) return null;

  return (
    <Button
      size="sm"
      className={
        variant === 'white'
          ? 'bg-white/15 text-white border border-white/40 hover:bg-white/25 backdrop-blur-sm transition-colors'
          : 'brand-gradient text-white border-0'
      }
      onClick={install}
    >
      <Download className="h-4 w-4 mr-1" />
      {t('pwa.installApp')}
    </Button>
  );
};

export default InstallAppButton;
```

---

### `src/components/PWAUpdatePrompt.tsx`

**Path:** `esl-booking-system/frontend/src/components/PWAUpdatePrompt.tsx`

```tsx
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

const PWAUpdatePrompt: React.FC = () => {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-white rounded-lg shadow-xl border p-4 max-w-sm animate-fade-in-up">
      <p className="text-sm font-medium mb-2">{t('pwa.updateAvailable')}</p>
      <Button
        size="sm"
        onClick={() => updateServiceWorker(true)}
        className="brand-gradient text-white border-0"
      >
        <RefreshCw className="h-4 w-4 mr-1" />
        {t('pwa.updateNow')}
      </Button>
    </div>
  );
};

export default PWAUpdatePrompt;
```

---

## Modified Frontend Files

### `vite.config.ts`

**Path:** `esl-booking-system/frontend/vite.config.ts`

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['brightfolks.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Brightfolks ESL Booking',
        short_name: 'Brightfolks',
        description: 'Book and manage ESL lessons with Brightfolks',
        theme_color: '#2E6B9E',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        importScripts: ['/sw-push.js'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Real-time data: bookings, availability, notifications — never serve stale
            urlPattern: ({ url }: { url: URL }) => {
              const p = url.pathname;
              return p.includes('/bookings') ||
                     p.includes('/teacher-slots') ||
                     p.includes('/available-teachers') ||
                     p.includes('/weekly-slots') ||
                     p.includes('/notifications') ||
                     p.includes('/dashboard') ||
                     p.includes('/waitlist');
            },
            handler: 'NetworkOnly',
          },
          {
            // Other API calls (packages, settings, etc.) — network-first with short cache
            urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 },
              networkTimeoutSeconds: 5,
            },
          },
        ],
      },
    }),
  ],
  build: {
    outDir: 'dist'
  },
  server: {
    port: 3000
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  base: '/',
})
```

---

### `index.html`

**Path:** `esl-booking-system/frontend/index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/brightfolks.svg" />
    <link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#2E6B9E" />
    <title>Brightfolks</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

---

### `src/vite-env.d.ts`

**Path:** `esl-booking-system/frontend/src/vite-env.d.ts`

```ts
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
```

---

### `src/App.tsx`

**Path:** `esl-booking-system/frontend/src/App.tsx`

```tsx
import { BrowserRouter as Router } from "react-router-dom";
import AppRoutes from "./Routes";
import ServerWakeUp from "./components/ServerWakeUp";
import PWAUpdatePrompt from "./components/PWAUpdatePrompt";

const App = () => {
  return (
    <ServerWakeUp>
      <Router>
        <AppRoutes />
        <PWAUpdatePrompt />
      </Router>
    </ServerWakeUp>
  );
};

export default App;
```

---

### `src/components/Navbar.tsx`

**Path:** `esl-booking-system/frontend/src/components/Navbar.tsx`

```tsx
import { useContext } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import BrandLogo from "@/components/BrandLogo";
import { CalendarDays, Users, User, LogOut, LayoutDashboard, GraduationCap, UserCog, Package, ClipboardList, PackagePlus, BookOpen } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import AuthContext from "@/context/AuthContext";
import NotificationBell from "@/components/NotificationBell";
import LanguageToggle from "@/components/LanguageToggle";
import InstallAppButton from "@/components/InstallAppButton";

const NavBar: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const authContext = useContext(AuthContext);
  const role = authContext?.user?.role;
  const isOwner = authContext?.user?.is_owner ?? false;

  const handleLogout = () => {
    authContext?.logout();
    navigate("/");
  };

  const logoLink = role === "super_admin" ? "/super-admin" : "/admin-dashboard";

  return (
    <header className="w-full brand-gradient shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to={logoLink} className="flex items-center">
          <BrandLogo variant="white" />
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-5">
          {role === "super_admin" ? (
            <>
              <Link
                to="/super-admin"
                className="flex flex-col items-center gap-0.5 text-white/70 hover:text-white transition-colors"
                title={t("nav.dashboard")}
              >
                <LayoutDashboard className="h-5 w-5" />
                <span className="text-[10px] font-medium">{t("nav.dashboard")}</span>
              </Link>
              <Link
                to="/super-admin/plans"
                className="flex flex-col items-center gap-0.5 text-white/70 hover:text-white transition-colors"
                title={t("nav.plans")}
              >
                <PackagePlus className="h-5 w-5" />
                <span className="text-[10px] font-medium">{t("nav.plans")}</span>
              </Link>
            </>
          ) : (
            <>
              <Link
                to="/admin-dashboard"
                className="flex flex-col items-center gap-0.5 text-white/70 hover:text-white transition-colors"
                title={t("nav.schedule")}
              >
                <CalendarDays className="h-5 w-5" />
                <span className="text-[10px] font-medium">{t("nav.schedule")}</span>
              </Link>

              <Link
                to="/packages"
                className="flex flex-col items-center gap-0.5 text-white/70 hover:text-white transition-colors"
                title={t("nav.packages")}
              >
                <Package className="h-5 w-5" />
                <span className="text-[10px] font-medium">{t("nav.packages")}</span>
              </Link>

              <Link
                to="/students"
                className="flex flex-col items-center gap-0.5 text-white/70 hover:text-white transition-colors"
                title={t("nav.students")}
              >
                <Users className="h-5 w-5" />
                <span className="text-[10px] font-medium">{t("nav.students")}</span>
              </Link>

              <Link
                to="/teachers"
                className="flex flex-col items-center gap-0.5 text-white/70 hover:text-white transition-colors"
                title={t("nav.teachers")}
              >
                <GraduationCap className="h-5 w-5" />
                <span className="text-[10px] font-medium">{t("nav.teachers")}</span>
              </Link>

              <Link
                to="/admin-users"
                className="flex flex-col items-center gap-0.5 text-white/70 hover:text-white transition-colors"
                title={t("nav.admins")}
              >
                <UserCog className="h-5 w-5" />
                <span className="text-[10px] font-medium">{t("nav.admins")}</span>
              </Link>
            </>
          )}

          {(role === "super_admin" || (role === "company_admin" && isOwner)) && (
            <Link
              to="/documentation"
              className="flex flex-col items-center gap-0.5 text-white/70 hover:text-white transition-colors"
              title={t("nav.documentation")}
            >
              <BookOpen className="h-5 w-5" />
              <span className="text-[10px] font-medium">{t("nav.documentation")}</span>
            </Link>
          )}

          <InstallAppButton variant="white" />
          <LanguageToggle variant="white" />
          <NotificationBell variant="white" />

          {/* Profile dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full h-9 w-9 text-white/70 hover:text-white hover:bg-white/10"
              >
                <User className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {(role === "company_admin" || role === "teacher") && (
                <DropdownMenuItem asChild>
                  <Link
                    to={role === "teacher" ? "/teacher-profile" : "/profile"}
                    className="cursor-pointer flex items-center gap-2"
                  >
                    <User className="h-4 w-4" />
                    {t("nav.profile")}
                  </Link>
                </DropdownMenuItem>
              )}
              {(role === "company_admin" || role === "super_admin") && (
                <DropdownMenuItem asChild>
                  <Link to="/activity-log" className="cursor-pointer flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" />
                    {t("nav.activityLog")}
                  </Link>
                </DropdownMenuItem>
              )}
              {(role === "company_admin" || role === "teacher") && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onClick={handleLogout}
                className="cursor-pointer text-destructive focus:text-destructive flex items-center gap-2"
              >
                <LogOut className="h-4 w-4" />
                {t("nav.logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>
    </header>
  );
};

export default NavBar;
```

---

### `src/pages/Home.tsx`

**Path:** `esl-booking-system/frontend/src/pages/Home.tsx`

```tsx
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Login from "../components/Login";
import LearnMore from "../components/LearnMore";
import TutorialPackages from "../components/TutorialPackages";
import Footer from "../components/Footer";
import LanguageToggle from "../components/LanguageToggle";
import BrandLogo from "@/components/BrandLogo";
import HeroIllustration from "@/components/HeroIllustration";
import WaveDivider from "@/components/WaveDivider";
import ScrollReveal from "@/components/ScrollReveal";
import { Building2, ArrowRight } from "lucide-react";
import InstallAppButton from "@/components/InstallAppButton";

const Home = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-white">
      {/* Top bar */}
      <header className="w-full brand-gradient sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <BrandLogo variant="white" />
          <div className="flex items-center gap-3">
            <LanguageToggle variant="white" />
            <InstallAppButton variant="white" />
            <Button
              size="sm"
              className="bg-white/15 text-white border border-white/40 hover:bg-white/25 transition-colors backdrop-blur-sm"
              onClick={() => navigate("/company/register")}
            >
              Register Center
            </Button>
          </div>
        </div>
      </header>

      {/* ─── Hero Section ──────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        {/* Background layers */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#EEF6FA] via-[#F0F9F7]/50 to-white" />
        <div className="absolute inset-0 pattern-dots-light" />
        <div className="absolute -top-20 -right-20 w-[500px] h-[500px] bg-gradient-to-bl from-[#D0E8F0]/40 to-transparent rounded-full blur-3xl animate-fade-in delay-300" />
        <div className="absolute -bottom-20 -left-20 w-[400px] h-[400px] bg-gradient-to-tr from-[#B3DDD4]/25 to-transparent rounded-full blur-3xl animate-fade-in delay-500" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-20">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">

            {/* Left — Text + Illustration */}
            <div className="flex-1 hidden lg:block">
              <div className="animate-fade-in-up">
                <div className="inline-flex items-center gap-2 brand-gradient text-white text-xs font-semibold px-4 py-2 rounded-full w-fit mb-6 shadow-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  ESL Management Platform
                </div>
              </div>

              <h1 className="text-5xl font-bold text-gray-900 leading-tight animate-fade-in-up delay-100">
                {t("home.welcome")}<br />
                <span className="brand-gradient-text">{t("home.brand")}</span>
              </h1>

              <p className="mt-5 text-lg text-gray-500 max-w-md animate-fade-in-up delay-200">
                {t("home.subtitle")}
              </p>

              <div className="mt-8 flex gap-3 animate-fade-in-up delay-300">
                <Button
                  variant="outline"
                  className="border-[#D0E8F0] hover:bg-[#EEF6FA] transition-colors"
                  onClick={() => document.getElementById("learn-more")?.scrollIntoView({ behavior: "smooth" })}
                >
                  {t("home.learnMore")}
                </Button>
                <Button
                  className="brand-gradient text-white shadow-md hover:shadow-lg transition-all border-0"
                  onClick={() => document.getElementById("tutorial-packages")?.scrollIntoView({ behavior: "smooth" })}
                >
                  {t("home.tutorialPackages")}
                </Button>
              </div>

              {/* Illustration */}
              <div className="mt-10 animate-fade-in delay-600">
                <HeroIllustration className="w-full max-w-[360px]" />
              </div>
            </div>

            {/* Right — Login card */}
            <div className="w-full lg:max-w-md flex-shrink-0 animate-fade-in-right delay-200">
              <Card className="glow-card rounded-2xl border-0 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 brand-gradient" />
                <CardHeader className="pb-2 text-center">
                  <div className="flex justify-center mb-2">
                    <BrandLogo size="lg" />
                  </div>
                  <CardTitle className="text-gray-500 text-base font-medium">
                    {t("home.welcomeBack")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Login />
                </CardContent>
              </Card>
            </div>

          </div>
        </div>
      </div>

      {/* Wave: Hero → Learn More */}
      <WaveDivider fill="#EEF6FA" />

      {/* ─── Learn More ────────────────────────────────────────────── */}
      <section id="learn-more" className="py-20 brand-gradient-subtle">
        <LearnMore />
      </section>

      {/* Wave: Learn More → Packages */}
      <WaveDivider fill="#ffffff" className="bg-gradient-to-r from-[#EEF6FA] to-[#F0F9F7]" />

      {/* ─── Tutorial Packages ─────────────────────────────────────── */}
      <section id="tutorial-packages" className="py-20 bg-white">
        <TutorialPackages />
      </section>

      {/* Wave: Packages → CTA */}
      <div className="bg-white">
        <WaveDivider fill="#2E6B9E" />
      </div>

      {/* ─── Company CTA ───────────────────────────────────────────── */}
      <section className="py-20 brand-gradient relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-72 h-72 bg-white/5 rounded-full blur-3xl animate-float-slow" />
        <div className="absolute -bottom-10 -left-10 w-56 h-56 bg-white/5 rounded-full blur-3xl animate-float" />

        <div className="relative max-w-3xl mx-auto px-4 text-center space-y-5">
          <ScrollReveal animation="fade-up">
            <div className="flex justify-center">
              <div className="p-3 bg-white/15 rounded-2xl">
                <Building2 className="h-10 w-10 text-white" />
              </div>
            </div>
          </ScrollReveal>
          <ScrollReveal animation="fade-up" delay={100}>
            <h2 className="text-2xl font-bold text-white">
              {t("home.companyCta")}
            </h2>
          </ScrollReveal>
          <ScrollReveal animation="fade-up" delay={200}>
            <p className="text-white/75 max-w-xl mx-auto">
              {t("home.companyCtaDesc")}
            </p>
          </ScrollReveal>
          <ScrollReveal animation="fade-up" delay={300}>
            <Button onClick={() => navigate("/company/register")} size="lg" className="gap-2 bg-white text-brand hover:bg-[#EEF6FA] shadow-lg transition-colors">
              {t("home.registerCenter")} <ArrowRight className="h-4 w-4" />
            </Button>
          </ScrollReveal>
        </div>
      </section>

      {/* Wave: CTA → Footer */}
      <div className="brand-gradient">
        <WaveDivider fill="#0f172a" />
      </div>

      <Footer />
    </div>
  );
};

export default Home;
```

---

### `src/components/Login.tsx`

**Path:** `esl-booking-system/frontend/src/components/Login.tsx`

```tsx
import { useState, useContext, useEffect } from "react";
import axios from "axios";
import { useTranslation } from "react-i18next";
import AuthContext, { UserRole } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { isPushSupported, subscribeToPush } from "@/utils/pushNotifications";

const ROLE_ROUTES: Record<UserRole, string> = {
  super_admin: "/super-admin",
  company_admin: "/admin-dashboard",
  teacher: "/teacher-dashboard",
  student: "/studentdashboard",
};

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation();

  const authContext = useContext(AuthContext);
  if (!authContext) throw new Error("AuthContext must be used within an AuthProvider");

  const { login } = authContext;
  const navigate = useNavigate();

  // Dev auto-login (opt-in)
  useEffect(() => {
    const devEmail = import.meta.env.VITE_DEV_EMAIL;
    const devPassword = import.meta.env.VITE_DEV_PASSWORD;
    const devAutoLoginEnabled = import.meta.env.VITE_DEV_AUTO_LOGIN === "true";
    if (import.meta.env.DEV && devAutoLoginEnabled && devEmail && devPassword) {
      axios
        .post(`${import.meta.env.VITE_API_URL}/api/auth/login`, {
          email: devEmail,
          password: devPassword,
        })
        .then((res) => {
          login(res.data.token, res.data.user);
          navigate(ROLE_ROUTES[res.data.user.role as UserRole] ?? "/");
        })
        .catch(() => {});
    }
  }, [login, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      const res = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/auth/login`,
        { email, password },
        { headers: { "Content-Type": "application/json" } }
      );

      const trialExpired = res.data.trial_expired ?? false;
      login(res.data.token, res.data.user, trialExpired);

      // Fire-and-forget push notification subscription
      if (isPushSupported()) {
        subscribeToPush(res.data.token).catch(() => {});
      }

      if (trialExpired) return navigate("/upgrade");
      navigate(ROLE_ROUTES[res.data.user.role as UserRole] ?? "/");
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.message || t("login.loginFailed"));
      } else {
        setError(t("login.unexpectedError"));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleLogin} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="email">{t("login.email")}</Label>
        <Input
          id="email"
          type="email"
          placeholder={t("login.emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">{t("login.password")}</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder={t("login.passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("login.loggingIn")}
          </>
        ) : (
          t("login.loginButton")
        )}
      </Button>

    </form>
  );
};

export default Login;
```

---

### `src/context/AuthContext.tsx`

**Path:** `esl-booking-system/frontend/src/context/AuthContext.tsx`

```tsx
import { createContext, useState, useEffect } from "react";
import axios from "axios";
import { setUserTimezone } from "@/utils/timezone";
import { unsubscribeFromPush } from "@/utils/pushNotifications";

export type UserRole = 'super_admin' | 'company_admin' | 'teacher' | 'student';

export interface User {
  id: number;
  name: string;
  role: UserRole;
  company_id: number | null;
  timezone?: string;
  is_owner?: boolean;
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  trialExpired: boolean;
  login: (token: string, user: User, trialExpired?: boolean) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const storedUser = localStorage.getItem("user");

  const [token, setToken] = useState<string | null>(
    localStorage.getItem("token")
  );
  const [user, setUser] = useState<User | null>(
    storedUser ? JSON.parse(storedUser) : null
  );
  const [trialExpired, setTrialExpired] = useState<boolean>(
    localStorage.getItem("trial_expired") === "true"
  );

  const login = (token: string, user: User, expired = false) => {
    setToken(token);
    setUser(user);
    setTrialExpired(expired);
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("trial_expired", String(expired));
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    if (user.timezone && user.timezone !== "UTC") {
      setUserTimezone(user.timezone);
    } else {
      setUserTimezone(browserTz);
    }
  };

  const logout = () => {
    const currentToken = token;
    setToken(null);
    setUser(null);
    setTrialExpired(false);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("trial_expired");
    localStorage.removeItem("userTimezone");

    if (currentToken) {
      unsubscribeFromPush(currentToken).catch(() => {});
    }
  };

  // Auto-logout on expired/invalid token (401 response)
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (res) => res,
      (err) => {
        if (err.response?.status === 401 && token) {
          logout();
          window.location.href = "/login";
        }
        return Promise.reject(err);
      }
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, [token]);

  return (
    <AuthContext.Provider value={{ token, user, trialExpired, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
```

---

## i18n Translation Files

### `en.json`

**Path:** `esl-booking-system/frontend/src/i18n/locales/en.json`

**Added section (between `notifications` and `profile`):**

```json
"pwa": {
  "installApp": "Install App",
  "pushNotifications": "Push Notifications",
  "pushDescription": "Receive notifications even when the app is closed",
  "updateAvailable": "A new version is available",
  "updateNow": "Update Now"
}
```

---

### `ko.json`

**Path:** `esl-booking-system/frontend/src/i18n/locales/ko.json`

**Added section (between `notifications` and `profile`):**

```json
"pwa": {
  "installApp": "앱 설치",
  "pushNotifications": "푸시 알림",
  "pushDescription": "앱이 닫혀 있어도 알림을 받을 수 있습니다",
  "updateAvailable": "새 버전이 있습니다",
  "updateNow": "지금 업데이트"
}
```

---

### `zh.json`

**Path:** `esl-booking-system/frontend/src/i18n/locales/zh.json`

**Added section (between `notifications` and `profile`):**

```json
"pwa": {
  "installApp": "安装应用",
  "pushNotifications": "推送通知",
  "pushDescription": "即使应用关闭也能收到通知",
  "updateAvailable": "有新版本可用",
  "updateNow": "立即更新"
}
```

---

## PWA Icon Assets

The following PNG files were generated from `frontend/public/brightfolks.svg` and placed in `frontend/public/`:

| File | Size | Purpose |
|------|------|---------|
| `pwa-192x192.png` | 192x192 | Standard Android icon |
| `pwa-512x512.png` | 512x512 | Splash screen |
| `pwa-maskable-192x192.png` | 192x192 | Maskable icon (with #2E6B9E background + padding) |
| `pwa-maskable-512x512.png` | 512x512 | Maskable icon (with #2E6B9E background + padding) |
| `apple-touch-icon-180x180.png` | 180x180 | iOS home screen icon |

---

## NPM Packages Added

### Backend

| Package | Version | Type |
|---------|---------|------|
| `web-push` | ^3.6.7 | production |

### Frontend

| Package | Version | Type |
|---------|---------|------|
| `vite-plugin-pwa` | ^0.21.1 | devDependency |
