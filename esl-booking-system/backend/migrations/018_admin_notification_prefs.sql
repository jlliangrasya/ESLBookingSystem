-- Per-sub-admin notification preferences.
--
-- `muted_notifications` holds a JSON array of notification category keys the
-- admin should NOT receive (catalog in backend/utils/notificationCategories.js).
-- NULL = nothing muted, so existing admins keep receiving everything and any
-- category added later is on by default. The owner is never filtered.
-- Safe to rerun: server.js also adds this column at boot.
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_permissions' AND COLUMN_NAME = 'muted_notifications');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE admin_permissions ADD COLUMN muted_notifications TEXT NULL',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
