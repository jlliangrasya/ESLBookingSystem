-- Shared packages: several students (e.g. siblings) booking against one package.
--
-- The package keeps its single owner in student_packages.student_id; other
-- students allowed to use it are listed here. Packages with no rows here behave
-- exactly as before.
CREATE TABLE IF NOT EXISTS student_package_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  student_package_id INT NOT NULL,
  student_id INT NOT NULL,
  added_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_package_member (student_package_id, student_id),
  INDEX idx_spm_student (student_id),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (student_package_id) REFERENCES student_packages(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Who actually attends the class. NULL = the package owner, so every existing
-- booking keeps resolving to the same student it always did.
-- Safe to rerun: server.js also adds these at boot, so they may already exist.
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'attendee_id');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE bookings ADD COLUMN attendee_id INT NULL',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND INDEX_NAME = 'idx_bookings_attendee');
SET @sql = IF(@idx_exists = 0,
    'CREATE INDEX idx_bookings_attendee ON bookings (attendee_id)',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
