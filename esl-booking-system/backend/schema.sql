-- ESL Booking Platform — Multi-Tenant MySQL Schema
-- Run this in MySQL Workbench or any MySQL client.
-- It drops and recreates all tables, then seeds initial data.

CREATE DATABASE IF NOT EXISTS esl_booking;
USE esl_booking;

-- ─────────────────────────────────────────
-- Drop tables in reverse dependency order
-- ─────────────────────────────────────────
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS student_feedback;
DROP TABLE IF EXISTS upgrade_requests;
DROP TABLE IF EXISTS class_reports;
DROP TABLE IF EXISTS teacher_leaves;
DROP TABLE IF EXISTS admin_permissions;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS closed_slots;
DROP TABLE IF EXISTS student_packages;
DROP TABLE IF EXISTS tutorial_packages;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS companies;
DROP TABLE IF EXISTS subscription_plans;

-- ─────────────────────────────────────────
-- Subscription Plans (managed by super_admin)
-- ─────────────────────────────────────────
CREATE TABLE subscription_plans (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  max_students  INT NOT NULL,
  max_teachers  INT NOT NULL,
  max_admins    INT NOT NULL DEFAULT 5,
  price_monthly DECIMAL(10,2) NOT NULL,
  description   TEXT,
  is_active     BOOLEAN DEFAULT TRUE
);

-- ─────────────────────────────────────────
-- Companies / ESL Centers
-- ─────────────────────────────────────────
CREATE TABLE companies (
  id                         INT AUTO_INCREMENT PRIMARY KEY,
  name                       VARCHAR(255) NOT NULL,
  email                      VARCHAR(255) UNIQUE NOT NULL,
  phone                      VARCHAR(50),
  address                    TEXT,
  subscription_plan_id       INT,
  status                     ENUM('pending','active','suspended','rejected','locked') DEFAULT 'pending',
  approved_by                INT NULL,
  approved_at                TIMESTAMP NULL,
  trial_ends_at              TIMESTAMP NULL,          -- set when approved on Free Trial plan
  next_due_date              DATE NULL,               -- monthly billing due date (set on paid plan approval)
  last_paid_at               TIMESTAMP NULL,          -- when super admin last marked as paid
  allow_student_pick_teacher    BOOLEAN DEFAULT TRUE,    -- students can choose their own teacher
  payment_qr_image              LONGTEXT NULL,           -- base64 QR code for GCash/PayMaya
  cancellation_hours            INT NOT NULL DEFAULT 1,  -- hours before class that cancellation is blocked
  cancellation_penalty_enabled  BOOLEAN DEFAULT FALSE,   -- show penalty notice to teachers
  created_at                    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subscription_plan_id) REFERENCES subscription_plans(id)
);

-- ─────────────────────────────────────────
-- Users (all roles)
-- ─────────────────────────────────────────
CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  company_id    INT NULL,           -- NULL for super_admin
  role          ENUM('super_admin','company_admin','teacher','student') NOT NULL,
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password      VARCHAR(255) NOT NULL,
  is_owner      BOOLEAN DEFAULT FALSE,   -- TRUE for the founding company admin
  is_active     BOOLEAN DEFAULT TRUE,    -- FALSE = soft-deleted (cannot login, hidden from lists)
  guardian_name VARCHAR(255),           -- students only
  nationality   VARCHAR(100),           -- students only
  age           INT,                    -- students only
  reset_token         VARCHAR(255) NULL,        -- password reset token
  reset_token_expires DATETIME NULL,            -- token expiry (1 hour)
  timezone      VARCHAR(50) DEFAULT 'UTC',      -- user's IANA timezone (e.g. Asia/Manila)
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  INDEX idx_users_company_role_active (company_id, role, is_active)
);

-- Add approved_by FK now that users table exists
ALTER TABLE companies
  ADD CONSTRAINT fk_approved_by FOREIGN KEY (approved_by) REFERENCES users(id);

-- ─────────────────────────────────────────
-- Admin Permissions (per sub-admin user)
-- ─────────────────────────────────────────
CREATE TABLE admin_permissions (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  user_id            INT NOT NULL UNIQUE,
  can_add_teacher    BOOLEAN DEFAULT FALSE,
  can_edit_teacher   BOOLEAN DEFAULT FALSE,
  can_delete_teacher BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────
-- Notifications (in-app, real-time via socket.io)
-- ─────────────────────────────────────────
CREATE TABLE notifications (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  company_id INT NULL,
  type       VARCHAR(100) NOT NULL,
  title      VARCHAR(255) NOT NULL,
  message    TEXT,
  is_read    BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notif_user_read_created (user_id, is_read, created_at)
);

-- ─────────────────────────────────────────
-- Tutorial Packages (per company)
-- ─────────────────────────────────────────
CREATE TABLE tutorial_packages (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  company_id       INT NOT NULL,
  package_name     VARCHAR(255) NOT NULL,
  session_limit    INT NOT NULL,
  price            DECIMAL(10,2) NOT NULL,
  subject          VARCHAR(255) NULL,
  duration_minutes INT DEFAULT 60,
  description      TEXT NULL,
  is_active        BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

-- ─────────────────────────────────────────
-- Student Packages
-- ─────────────────────────────────────────
CREATE TABLE student_packages (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  company_id         INT NOT NULL,
  student_id         INT NOT NULL,
  package_id         INT NOT NULL,
  teacher_id         INT NULL,
  subject            VARCHAR(255) NOT NULL DEFAULT '',
  sessions_remaining INT NOT NULL,
  payment_status     ENUM('unpaid','paid','rejected') DEFAULT 'unpaid',
  receipt_image      LONGTEXT NULL,   -- base64 payment receipt uploaded by student
  purchased_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (student_id) REFERENCES users(id),
  FOREIGN KEY (package_id) REFERENCES tutorial_packages(id),
  FOREIGN KEY (teacher_id) REFERENCES users(id),
  INDEX idx_sp_company_payment (company_id, payment_status),
  INDEX idx_sp_student_payment (student_id, payment_status)
);

-- ─────────────────────────────────────────
-- Bookings
-- ─────────────────────────────────────────
CREATE TABLE bookings (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  company_id           INT NOT NULL,
  student_package_id   INT NOT NULL,
  teacher_id           INT NULL,
  appointment_date     DATETIME NOT NULL,
  status               VARCHAR(50) DEFAULT 'pending',
  rescheduled_by_admin BOOLEAN DEFAULT FALSE,
  class_mode           VARCHAR(50) NULL,    -- e.g. Voov, Classin, Google Meet, Zoom, Others
  meeting_link         VARCHAR(500) NULL,   -- URL to the meeting
  student_absent       BOOLEAN DEFAULT FALSE,  -- teacher marks student absent (15 min after class start)
  teacher_absent       BOOLEAN DEFAULT FALSE,  -- student marks teacher absent (15 min after class start)
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id)         REFERENCES companies(id),
  FOREIGN KEY (student_package_id) REFERENCES student_packages(id),
  FOREIGN KEY (teacher_id)         REFERENCES users(id),
  INDEX idx_bookings_company_date_status (company_id, appointment_date, status),
  INDEX idx_bookings_teacher_date (teacher_id, appointment_date)
);

-- ─────────────────────────────────────────
-- Closed Slots (per company, optionally per teacher)
-- ─────────────────────────────────────────
CREATE TABLE closed_slots (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  teacher_id INT NULL,    -- NULL = company-wide closed slot
  date       DATE NOT NULL,
  time       VARCHAR(20) NOT NULL,
  UNIQUE KEY unique_slot (company_id, teacher_id, date, time),
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (teacher_id) REFERENCES users(id)
);

-- ─────────────────────────────────────────
-- Teacher Leave Requests
-- ─────────────────────────────────────────
CREATE TABLE teacher_leaves (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  company_id   INT NOT NULL,
  teacher_id   INT NOT NULL,
  leave_date   DATE NOT NULL,
  reason_type  ENUM('sick','personal','vacation','other') DEFAULT 'personal',
  notes        TEXT NULL,
  status       ENUM('pending','approved','rejected') DEFAULT 'pending',
  processed_by INT NULL,
  processed_at TIMESTAMP NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id)   REFERENCES companies(id),
  FOREIGN KEY (teacher_id)   REFERENCES users(id),
  FOREIGN KEY (processed_by) REFERENCES users(id)
);

-- ─────────────────────────────────────────
-- Class Reports (teacher submits after each completed class)
-- ─────────────────────────────────────────
CREATE TABLE class_reports (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  booking_id INT NOT NULL UNIQUE,   -- one report per booking
  teacher_id INT NOT NULL,
  student_id INT NOT NULL,
  new_words  TEXT NULL,
  sentences  TEXT NULL,
  notes      TEXT NULL,
  remarks    TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (booking_id) REFERENCES bookings(id),
  FOREIGN KEY (teacher_id) REFERENCES users(id),
  FOREIGN KEY (student_id) REFERENCES users(id)
);

-- ─────────────────────────────────────────
-- Upgrade Requests (company admin → super_admin approval)
-- ─────────────────────────────────────────
-- ─────────────────────────────────────────
-- Student Feedback
-- ─────────────────────────────────────────
CREATE TABLE student_feedback (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  company_id  INT NOT NULL,
  student_id  INT NOT NULL,
  teacher_id  INT NULL,
  message     TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (student_id) REFERENCES users(id),
  FOREIGN KEY (teacher_id) REFERENCES users(id)
);

CREATE TABLE upgrade_requests (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  company_id           INT NOT NULL,
  subscription_plan_id INT NOT NULL,
  status               ENUM('pending','approved','rejected') DEFAULT 'pending',
  notes                TEXT NULL,      -- JSON: { reference_number, contact_name, contact_email }
  processed_by         INT NULL,
  processed_at         TIMESTAMP NULL,
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id)           REFERENCES companies(id),
  FOREIGN KEY (subscription_plan_id) REFERENCES subscription_plans(id),
  FOREIGN KEY (processed_by)         REFERENCES users(id)
);

-- ─────────────────────────────────────────
-- Audit Logs (action history per company)
-- ─────────────────────────────────────────
CREATE TABLE audit_logs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  company_id  INT NULL,
  user_id     INT NULL,
  action      VARCHAR(100) NOT NULL,
  target_type VARCHAR(50) NULL,
  target_id   INT NULL,
  details     TEXT NULL,          -- JSON string with extra context
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_company_created (company_id, created_at),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id)    REFERENCES users(id)     ON DELETE SET NULL
);

-- ─────────────────────────────────────────
-- Seed: Subscription Plans
-- ─────────────────────────────────────────
INSERT INTO subscription_plans (name, max_students, max_teachers, max_admins, price_monthly, description) VALUES
  ('Free Trial',  2,   1,  1,     0.00, '30-day free trial. Up to 2 students, 1 teacher, and 1 admin. No credit card required.'),
  ('Basic',      20,   3,  5,   999.00, 'Up to 20 students, 3 teachers, and 5 admins. Perfect for small ESL centers.'),
  ('Standard',   50,  10, 10,  2499.00, 'Up to 50 students, 10 teachers, and 10 admins. Great for growing centers.'),
  ('Premium',   100,  25, 20,  4999.00, 'Up to 100 students, 25 teachers, and 20 admins. For established ESL businesses.');

-- ─────────────────────────────────────────
-- Seed: Super Admin
-- Default password: Admin@2024!
-- To generate a new hash:
--   node -e "const b=require('bcryptjs'); b.hash('YOUR_PASSWORD',10).then(console.log)"
-- ─────────────────────────────────────────
INSERT INTO users (company_id, role, name, email, password) VALUES
  (NULL, 'super_admin', 'Platform Admin', 'admin@eunitalk.com',
   '$2b$10$E6LmSNalJn6/m0LbNJY9HO4gWjnIfncBRFjYlNDHaBrLs7j7SKSlW');

-- ─────────────────────────────────────────
-- Live DB: Add missing indexes (Session 8)
-- Run on existing database (skips if already present)
-- ─────────────────────────────────────────
-- ALTER TABLE users        ADD INDEX idx_users_company_role_active (company_id, role, is_active);
-- ALTER TABLE notifications ADD INDEX idx_notif_user_read_created  (user_id, is_read, created_at);
-- ALTER TABLE student_packages ADD INDEX idx_sp_company_payment    (company_id, payment_status);
-- ALTER TABLE student_packages ADD INDEX idx_sp_student_payment    (student_id, payment_status);
-- ALTER TABLE bookings      ADD INDEX idx_bookings_company_date_status (company_id, appointment_date, status);
-- ALTER TABLE bookings      ADD INDEX idx_bookings_teacher_date    (teacher_id, appointment_date);
