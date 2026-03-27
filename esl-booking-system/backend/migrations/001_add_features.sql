-- Migration: Add tables and columns for Issues #6, #8, #12
-- Run this migration against your database before deploying

-- Issue #6: Waitlist table
CREATE TABLE IF NOT EXISTS waitlist (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    student_id INT NOT NULL,
    teacher_id INT NOT NULL,
    desired_date DATE NOT NULL,
    desired_time VARCHAR(10) NOT NULL,
    status ENUM('waiting', 'notified', 'expired') DEFAULT 'waiting',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (student_id) REFERENCES users(id),
    FOREIGN KEY (teacher_id) REFERENCES users(id),
    INDEX idx_waitlist_slot (company_id, teacher_id, desired_date, desired_time, status)
);

-- Issue #8: Add 'reminded' flag to bookings for class reminder tracking
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminded BOOLEAN DEFAULT FALSE;
-- Index to speed up the reminder query
ALTER TABLE bookings ADD INDEX IF NOT EXISTS idx_bookings_reminder (status, reminded, appointment_date);

-- Session adjustments log (admin add/deduct sessions)
CREATE TABLE IF NOT EXISTS session_adjustments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    student_package_id INT NOT NULL,
    adjusted_by INT NOT NULL,
    adjustment INT NOT NULL COMMENT 'positive = added, negative = deducted',
    remarks TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (student_package_id) REFERENCES student_packages(id),
    FOREIGN KEY (adjusted_by) REFERENCES users(id),
    INDEX idx_sa_package (student_package_id)
);

-- Payment method setting for companies: 'encasher' or 'communication_platform'
ALTER TABLE companies ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30) NULL DEFAULT NULL;

-- Issue #12: Backup logs table
CREATE TABLE IF NOT EXISTS backup_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    backup_type VARCHAR(50) NOT NULL,
    status ENUM('success', 'failed') DEFAULT 'success',
    details JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
