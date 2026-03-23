-- ESL Booking Platform — Multi-Tenant MySQL Schema
-- Run this in MySQL Workbench or any MySQL client.
-- It drops and recreates all tables, then seeds initial data.


USE esl_booking;

ALTER TABLE companies
  ADD COLUMN company_name VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN company_email VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN company_phone VARCHAR(50) NULL,
  ADD COLUMN company_address TEXT NULL;

CREATE TABLE IF NOT EXISTS company_payments (
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
);
