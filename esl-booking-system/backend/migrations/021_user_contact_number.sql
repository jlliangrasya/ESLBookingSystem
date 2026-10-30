-- Teacher contact number, so the admin has a record of how to reach each teacher.
--
-- Lives on users (not a teacher-only table) since it's just a profile field;
-- NULL = not provided. Free text, not validated beyond length, because numbers
-- come in many local formats (+63 917 ..., 0917-..., etc.).
--
-- Safe to rerun: server.js also applies this at boot.
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'contact_number');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE users ADD COLUMN contact_number VARCHAR(50) NULL',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
