-- ESL Booking Platform — Multi-Tenant MySQL Schema
-- Run this in MySQL Workbench. It drops and recreates all tables.

CREATE DATABASE IF NOT EXISTS esl_booking;
USE esl_booking;

-- Drop in reverse dependency order
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
  price_monthly DECIMAL(10,2) NOT NULL,
  description   TEXT
);

-- ─────────────────────────────────────────
-- Companies / ESL Centers
-- ─────────────────────────────────────────
CREATE TABLE companies (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  name                 VARCHAR(255) NOT NULL,
  email                VARCHAR(255) UNIQUE NOT NULL,
  phone                VARCHAR(50),
  address              TEXT,
  subscription_plan_id INT,
  status               ENUM('pending','active','suspended','rejected') DEFAULT 'pending',
  approved_by          INT NULL,
  approved_at          TIMESTAMP NULL,
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subscription_plan_id) REFERENCES subscription_plans(id)
);

-- ─────────────────────────────────────────
-- Users (all roles)
-- ─────────────────────────────────────────
CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  company_id    INT NULL,          -- NULL for super_admin
  role          ENUM('super_admin','company_admin','teacher','student') NOT NULL,
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password      VARCHAR(255) NOT NULL,
  guardian_name VARCHAR(255),      -- students only
  nationality   VARCHAR(100),      -- students only
  age           INT,               -- students only
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

-- Add approved_by FK now that users table exists
ALTER TABLE companies
  ADD CONSTRAINT fk_approved_by FOREIGN KEY (approved_by) REFERENCES users(id);

-- ─────────────────────────────────────────
-- Tutorial Packages (per company)
-- ─────────────────────────────────────────
CREATE TABLE tutorial_packages (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  company_id    INT NOT NULL,
  package_name  VARCHAR(255) NOT NULL,
  session_limit INT NOT NULL,
  price         DECIMAL(10,2) NOT NULL,
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
  subject            VARCHAR(50) NOT NULL,
  sessions_remaining INT NOT NULL,
  payment_status     ENUM('unpaid','paid','rejected') DEFAULT 'unpaid',
  purchased_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id)  REFERENCES companies(id),
  FOREIGN KEY (student_id)  REFERENCES users(id),
  FOREIGN KEY (package_id)  REFERENCES tutorial_packages(id),
  FOREIGN KEY (teacher_id)  REFERENCES users(id)
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
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id)         REFERENCES companies(id),
  FOREIGN KEY (student_package_id) REFERENCES student_packages(id),
  FOREIGN KEY (teacher_id)         REFERENCES users(id)
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
-- Seed: Subscription Plans
-- ─────────────────────────────────────────
INSERT INTO subscription_plans (name, max_students, max_teachers, price_monthly, description) VALUES
  ('Basic',    20,  3,  999.00, 'Up to 20 students and 3 teachers. Perfect for small ESL centers.'),
  ('Standard', 50,  10, 2499.00, 'Up to 50 students and 10 teachers. Great for growing centers.'),
  ('Premium',  100, 25, 4999.00, 'Up to 100 students and 25 teachers. For established ESL businesses.');

-- ─────────────────────────────────────────
-- Seed: Super Admin
-- (password must be bcrypt-hashed — see instructions below)
-- Replace the hash below with: node -e "const b=require('bcryptjs');b.hash('YOUR_PASSWORD',10).then(console.log)"
-- ─────────────────────────────────────────
-- Default super_admin password: Admin@2024!  (change after first login via /api/admin/profile)
INSERT INTO users (company_id, role, name, email, password) VALUES
  (NULL, 'super_admin', 'Platform Admin', 'admin@eunitalk.com',
   '$2b$10$E6LmSNalJn6/m0LbNJY9HO4gWjnIfncBRFjYlNDHaBrLs7j7SKSlW');
