/**
 * Run all pending migrations against TiDB / MySQL.
 *
 * Usage:
 *   node migrations/run_all.js                  # uses .env
 *   DB_HOST=x DB_USER=x DB_PASS=x node migrations/run_all.js   # explicit
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const poolConfig = {
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME || 'esl_booking',
  port:     Number(process.env.DB_PORT) || 4000,
  waitForConnections: true,
  connectionLimit: 2,
  multipleStatements: true,
};
if (process.env.DB_SSL === 'true') {
  poolConfig.ssl = { rejectUnauthorized: true };
}

const MIGRATIONS = [
  // ── Company columns + payments table ──────────────────────────────────────
  {
    name: 'company_name columns',
    check: "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'company_name'",
    up: `ALTER TABLE companies
      ADD COLUMN company_name VARCHAR(255) NOT NULL DEFAULT '',
      ADD COLUMN company_email VARCHAR(255) NOT NULL DEFAULT '',
      ADD COLUMN company_phone VARCHAR(50) NULL,
      ADD COLUMN company_address TEXT NULL`,
  },
  {
    name: 'company_payments table',
    check: "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company_payments'",
    up: `CREATE TABLE IF NOT EXISTS company_payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_id INT NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      payment_date DATE NOT NULL,
      period_start DATE NULL,
      period_end DATE NULL,
      notes TEXT NULL,
      recorded_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (recorded_by) REFERENCES users(id)
    )`,
  },
  // ── 004: Announcements ────────────────────────────────────────────────────
  {
    name: 'announcements table',
    check: "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'announcements'",
    file: '004_announcements.sql',
  },
  // ── 005: Bulk imports ─────────────────────────────────────────────────────
  {
    name: 'bulk_import_logs table',
    check: "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bulk_import_logs'",
    file: '005_bulk_imports.sql',
  },
  // ── 006: Homework / Assignments ───────────────────────────────────────────
  {
    name: 'assignments table',
    check: "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assignments'",
    file: '006_homework.sql',
  },
  // ── 007: Recurring schedules ──────────────────────────────────────────────
  {
    name: 'recurring_schedules table',
    check: "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'recurring_schedules'",
    file: '007_recurring_schedules.sql',
  },
];

async function main() {
  const pool = mysql.createPool(poolConfig);
  console.log(`Connecting to ${poolConfig.host}:${poolConfig.port}/${poolConfig.database} ...`);

  try {
    await pool.query('SELECT 1');
    console.log('Connected.\n');
  } catch (err) {
    console.error('Connection failed:', err.message);
    process.exit(1);
  }

  for (const m of MIGRATIONS) {
    // Check if already applied
    const [[row]] = await pool.query(m.check);
    if (row.cnt > 0) {
      console.log(`  SKIP: ${m.name} (already exists)`);
      continue;
    }

    // Get SQL
    let sql;
    if (m.file) {
      sql = fs.readFileSync(path.join(__dirname, m.file), 'utf8');
    } else {
      sql = m.up;
    }

    console.log(`  APPLY: ${m.name} ...`);
    try {
      await pool.query(sql);
      console.log(`    OK`);
    } catch (err) {
      console.error(`    FAIL: ${err.message}`);
    }
  }

  // ── Backfill: copy existing name/email into company_name/company_email ──
  // Only if the old 'name' column still exists (backward compat)
  try {
    const [[colCheck]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'name'"
    );
    if (colCheck.cnt > 0) {
      console.log('\n  BACKFILL: Copying companies.name → company_name (where empty) ...');
      await pool.query("UPDATE companies SET company_name = name WHERE company_name = '' AND name IS NOT NULL AND name != ''");
      await pool.query("UPDATE companies SET company_email = email WHERE company_email = '' AND email IS NOT NULL AND email != ''");
      await pool.query("UPDATE companies SET company_phone = phone WHERE company_phone IS NULL AND phone IS NOT NULL AND phone != ''");
      await pool.query("UPDATE companies SET company_address = address WHERE company_address IS NULL AND address IS NOT NULL AND address != ''");
      console.log('    OK — existing companies backfilled');
    }
  } catch (err) {
    console.log('  Backfill skipped:', err.message);
  }

  console.log('\nAll migrations complete.');
  await pool.end();
  process.exit(0);
}

main();
