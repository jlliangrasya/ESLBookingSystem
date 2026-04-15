-- Migration: Recurring class scheduling tables
-- Run this migration against your database before deploying

CREATE TABLE IF NOT EXISTS recurring_schedules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    student_package_id INT NOT NULL,
    teacher_id INT NOT NULL,
    student_id INT NOT NULL,
    days_of_week JSON NOT NULL,
    start_time TIME NOT NULL,
    duration_minutes INT NOT NULL,
    slots_per_class INT NOT NULL,
    num_weeks INT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_possible INT NOT NULL,
    sessions_booked INT NOT NULL,
    skipped_dates JSON NULL,
    status ENUM('active','cancelled','completed') DEFAULT 'active',
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    cancelled_at TIMESTAMP NULL DEFAULT NULL,
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (student_package_id) REFERENCES student_packages(id),
    FOREIGN KEY (teacher_id) REFERENCES users(id),
    FOREIGN KEY (student_id) REFERENCES users(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_rs_company (company_id, status),
    INDEX idx_rs_teacher (teacher_id, status),
    INDEX idx_rs_student (student_id)
);

-- Add recurring_schedule_id to bookings (safe to rerun)
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'recurring_schedule_id');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE bookings ADD COLUMN recurring_schedule_id INT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND INDEX_NAME = 'idx_bookings_recurring');
SET @sql = IF(@idx_exists = 0,
    'ALTER TABLE bookings ADD INDEX idx_bookings_recurring (recurring_schedule_id)',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
