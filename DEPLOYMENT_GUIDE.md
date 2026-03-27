# ESL Booking System — Deployment Guide

This guide walks through deploying the full system for free using:
- **TiDB Cloud Serverless** — MySQL-compatible database (free, always-on)
- **Render** — Backend Node.js server (free tier)
- **Vercel** — Frontend React app (free tier)

No credit card required for any of these.

---

## Prerequisites

- Git installed, repo cloned and on latest `main`
- MySQL Workbench (for exporting local database)
- Node.js 18+ installed
- A GitHub account (repo: https://github.com/jlliangrasya/ESLBookingSystem)

---

## PHASE 1: Database (TiDB Cloud)

### Step 1.1 — Export your local MySQL database

1. Open **MySQL Workbench**
2. Connect to your local MySQL server
3. Go to **Server → Data Export**
4. Select the `esl_booking` database
5. Check **"Export to Self-Contained File"**
6. Check **"Include Create Schema"** (if available)
7. Under **Objects to Export**, make sure both **"Dump Structure and Data"** is selected
8. Click **Start Export**
9. Save the file as `esl_booking_dump.sql`

**Alternative (command line):** If you have `mysqldump` available:
```bash
mysqldump -u root -p --databases esl_booking --set-gtid-purged=OFF > esl_booking_dump.sql
```

### Step 1.2 — Create a TiDB Cloud Serverless cluster

1. Go to https://tidbcloud.com and sign up (use Google or GitHub — no credit card)
2. Click **"Create Cluster"**
3. Choose **"Serverless"** (the free one)
4. **Cluster Name:** `esl-booking` (or anything you want)
5. **Region:** Choose the closest to your users (e.g., `ap-southeast-1` for Asia)
6. Click **"Create"** — it takes about 30 seconds

### Step 1.3 — Get your connection details

1. Once the cluster is ready, click **"Connect"** (top right)
2. Choose connection method: **"General"**
3. Note down these values — you'll need them for Render:
   - **Host:** e.g., `gateway01.ap-southeast-1.prod.aws.tidbcloud.com`
   - **Port:** `4000`
   - **User:** e.g., `randomstring.root`
   - **Password:** (auto-generated, copy it now or reset later)

### Step 1.4 — Create the database

In the TiDB Cloud console:
1. Click **"SQL Editor"** (left sidebar, or use "Chat2Query")
2. Run:
```sql
CREATE DATABASE IF NOT EXISTS esl_booking;
```

### Step 1.5 — Import your data

**Option A: Using TiDB Cloud SQL Editor (for smaller dumps)**
1. Open your `esl_booking_dump.sql` file in a text editor
2. Copy the SQL contents (may need to do it in chunks if large)
3. Paste into the TiDB SQL Editor and run

**Option B: Using MySQL CLI (recommended for larger databases)**

Install the MySQL client if you don't have it, then:
```bash
mysql -u '<your-tidb-username>' -h '<your-tidb-host>' -P 4000 -p --ssl-mode=VERIFY_IDENTITY esl_booking < esl_booking_dump.sql
```

**Option C: Using MySQL Workbench**
1. Create a new connection in MySQL Workbench:
   - **Hostname:** your TiDB host
   - **Port:** 4000
   - **Username:** your TiDB username
   - **Password:** your TiDB password
   - **SSL:** Go to "SSL" tab → set "Use SSL" to **"Require"**
2. Connect, then go to **Server → Data Import**
3. Select **"Import from Self-Contained File"** → choose your `esl_booking_dump.sql`
4. Set **Default Target Schema** to `esl_booking`
5. Click **Start Import**

### Step 1.6 — Verify the import

In the TiDB SQL Editor, run:
```sql
USE esl_booking;
SHOW TABLES;
SELECT COUNT(*) FROM users;
```
Make sure your tables and data are there.

---

## PHASE 2: Backend (Render)

### Step 2.1 — Sign up for Render

1. Go to https://render.com
2. Sign up with your **GitHub** account
3. Authorize Render to access your repositories

### Step 2.2 — Create a Web Service

1. Click **"New +"** → **"Web Service"**
2. Connect your GitHub repo: `jlliangrasya/ESLBookingSystem`
3. Configure the service:
   - **Name:** `esl-booking-api` (or any name)
   - **Region:** Choose the same region as your TiDB cluster if possible
   - **Branch:** `main`
   - **Root Directory:** `esl-booking-system/backend`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** **Free**

### Step 2.3 — Set environment variables

In the Render dashboard for your service, go to **"Environment"** and add:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `DB_HOST` | *(your TiDB host, e.g., gateway01.ap-southeast-1.prod.aws.tidbcloud.com)* |
| `DB_PORT` | `4000` |
| `DB_USER` | *(your TiDB username, e.g., randomstring.root)* |
| `DB_PASS` | *(your TiDB password)* |
| `DB_NAME` | `esl_booking` |
| `DB_SSL` | `true` |
| `JWT_SECRET` | *(generate a new one — see below)* |
| `SUPER_ADMIN_EMAIL` | *(your admin email)* |
| `SUPER_ADMIN_PASSWORD` | *(your admin password)* |
| `FRONTEND_URL` | *(leave blank for now, fill in after Vercel deploy)* |

**Generate a new JWT_SECRET** (run this locally in terminal):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 2.4 — Deploy

1. Click **"Create Web Service"**
2. Render will build and deploy automatically
3. Wait for the deploy to finish (2-5 minutes)
4. Your backend URL will be: `https://esl-booking-api.onrender.com` (or similar)
5. Test by visiting: `https://esl-booking-api.onrender.com/health`
   - Should return: `{"status":"ok"}`

> **Note:** On Render's free tier, the service sleeps after 15 minutes of inactivity.
> The first request after sleeping takes 30-50 seconds. This is normal.

---

## PHASE 3: Frontend (Vercel)

### Step 3.1 — Deploy with Vercel CLI

On the machine with Vercel CLI installed, pull the latest code, then:

```bash
cd esl-booking-system/frontend
```

Create a `.env.production` file (this won't be committed to git):
```bash
echo "VITE_API_URL=https://esl-booking-api.onrender.com" > .env.production
```
*(Replace the URL with your actual Render backend URL from Phase 2)*

Then deploy:
```bash
npx vercel --prod
```

When prompted:
- **Set up and deploy?** Yes
- **Which scope?** Select your account
- **Link to existing project?** No (first time)
- **Project name?** `esl-booking-system` (or any name)
- **Directory with source code?** `./` (current directory)
- **Override build settings?** Yes
  - **Build Command:** `npm run build`
  - **Output Directory:** `dist`
  - **Install Command:** `npm install`

### Step 3.2 — Set environment variable in Vercel

If the CLI didn't prompt for env vars, set it in the dashboard:

1. Go to https://vercel.com → your project → **Settings** → **Environment Variables**
2. Add:
   - **Key:** `VITE_API_URL`
   - **Value:** `https://esl-booking-api.onrender.com` *(your Render URL)*
   - **Environment:** Production, Preview, Development
3. **Redeploy** the project for the env var to take effect

### Step 3.3 — Note your frontend URL

Your frontend will be at something like: `https://esl-booking-system.vercel.app`

---

## PHASE 4: Connect Everything

### Step 4.1 — Update Render's FRONTEND_URL

1. Go to Render dashboard → your service → **Environment**
2. Set `FRONTEND_URL` to your Vercel URL (e.g., `https://esl-booking-system.vercel.app`)
3. This enables CORS and is used for password reset email links
4. Render will auto-redeploy

### Step 4.2 — Test the full system

1. Open your Vercel frontend URL in a browser
2. Try logging in with your super admin credentials
3. Test creating a booking
4. Check that real-time notifications work (Socket.io)

### Step 4.3 — Verify health check

```bash
curl https://esl-booking-api.onrender.com/health
```
Should return: `{"status":"ok"}`

---

## Troubleshooting

### Backend won't start on Render
- Check the **Logs** tab in Render dashboard
- Most common issue: missing or wrong environment variables
- Make sure `JWT_SECRET` is at least 32 characters

### Database connection fails
- Verify `DB_SSL=true` is set (TiDB requires SSL)
- Check that the TiDB host/port/user/password are correct
- TiDB port is `4000`, not `3306`

### CORS errors in browser
- Make sure `FRONTEND_URL` on Render matches your exact Vercel URL
- No trailing slash (use `https://esl-booking-system.vercel.app` not `https://esl-booking-system.vercel.app/`)

### Socket.io not connecting
- Socket.io runs on the Render backend, not TiDB
- Check browser console for WebSocket connection errors
- Ensure CORS origin matches the frontend URL

### Render service sleeping (slow first load)
- This is normal on the free tier — service sleeps after 15 min of inactivity
- First request after sleep takes 30-50 seconds
- Workaround: use a free uptime monitor (e.g., UptimeRobot) to ping `/health` every 14 minutes

### TiDB compatibility issues
- TiDB is MySQL-compatible but has some differences
- Most common: no foreign key enforcement by default (data still stored correctly)
- If you see SQL errors, check TiDB docs for MySQL compatibility

---

## Summary of URLs and Credentials

After deployment, fill in your actual values:

| Service | URL |
|---------|-----|
| Frontend (Vercel) | `https://________________.vercel.app` |
| Backend (Render) | `https://________________.onrender.com` |
| Database (TiDB) | Host: `________________` Port: `4000` |

| Env Variable | Where to set | Value |
|-------------|-------------|-------|
| `VITE_API_URL` | Vercel | Your Render backend URL |
| `FRONTEND_URL` | Render | Your Vercel frontend URL |
| `DB_HOST` | Render | Your TiDB host |
| `DB_PORT` | Render | `4000` |
| `DB_USER` | Render | Your TiDB username |
| `DB_PASS` | Render | Your TiDB password |
| `DB_NAME` | Render | `esl_booking` |
| `DB_SSL` | Render | `true` |
| `JWT_SECRET` | Render | Generate a new 64-char hex string |
| `NODE_ENV` | Render | `production` |

---

## Free Tier Limits

| Service | Limit | Enough for? |
|---------|-------|-------------|
| **TiDB Serverless** | 5GB storage, 50M requests/month | Hundreds of students, easily |
| **Render Free** | 750 hrs/month, sleeps after 15 min idle | One backend service 24/7 |
| **Vercel Free** | 100GB bandwidth/month | Thousands of users |

All free tiers are **permanent** — no trial period, no credit card required.
