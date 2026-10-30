-- "Disabled" students: a lighter alternative to deactivating.
--
-- A disabled student is left out of the dashboard's Active Students count and
-- the "N or Fewer Classes Left" panel, and nothing else. Unlike is_active =
-- FALSE they can still log in, keep their bookings, and still count toward the
-- plan's seat limit and the teachers' class counts.
--
-- Safe to rerun: server.js also applies this at boot.
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'is_disabled');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE users ADD COLUMN is_disabled BOOLEAN NOT NULL DEFAULT FALSE',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
