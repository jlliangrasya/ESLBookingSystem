-- Late absence notice → half-class credit (per-company policy).
--
-- If a student tells the team they can't attend within the first
-- `late_notice_minutes` after class start, the class (already deducted at
-- booking time) earns the student a 0.5 credit on the same package. Two open
-- halves on one package combine into +1 session; a single half can be redeemed
-- by paying half the per-class price (admin confirms). Halves expire once their
-- package is used up. Sessions stay whole numbers — halves live in their own table.
--
-- Safe to rerun: server.js also applies all of this at boot.
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'late_notice_enabled');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE companies ADD COLUMN late_notice_enabled BOOLEAN NOT NULL DEFAULT FALSE, ADD COLUMN late_notice_minutes INT NOT NULL DEFAULT 15',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- When the student notified the team. Non-null + student_absent = late notice.
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'absence_notice_at');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE bookings ADD COLUMN absence_notice_at DATETIME NULL',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- No FKs to users on purpose: the user hard-delete paths purge by hand and
-- would otherwise have to know about this table.
CREATE TABLE IF NOT EXISTS half_credits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    student_package_id INT NOT NULL,
    student_id INT NOT NULL,
    booking_id INT NULL,
    status ENUM('open','combined','paid','expired','voided') NOT NULL DEFAULT 'open',
    value_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    currency VARCHAR(10) NULL,
    combined_with_id INT NULL,
    amount_paid DECIMAL(10,2) NULL,
    payment_reference VARCHAR(255) NULL,
    redeemed_by INT NULL,
    redeemed_at DATETIME NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_hc_package (company_id, student_package_id, status),
    INDEX idx_hc_student (student_id),
    INDEX idx_hc_booking (booking_id),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (student_package_id) REFERENCES student_packages(id) ON DELETE CASCADE,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
);
