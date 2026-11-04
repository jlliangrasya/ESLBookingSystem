-- Soft-deleted ("archived") accounts.
--
-- Deleting a student, teacher or admin no longer removes the users row: their
-- past bookings, class reports, packages and payments must stay on record
-- (a completed class is still a completed class after the person leaves).
-- Instead the account is marked deleted_at = NOW(), is_active = FALSE (so it
-- cannot log in and no longer uses a seat), hidden from rosters, and its email
-- is rewritten to "deleted-<id>-<email>" so the address can be registered again.
--
-- Safe to rerun: server.js also applies this at boot.
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'deleted_at');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE users ADD COLUMN deleted_at DATETIME NULL',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
