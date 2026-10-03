-- Granular sub-admin permissions.
--
-- `permissions` holds a JSON array of permission keys (e.g. "students.view",
-- "students.add_sessions"); the catalog lives in backend/utils/permissions.js.
-- NULL means "not migrated yet": the row is read through legacyPermissions(),
-- which reproduces the access the old can_*_teacher flags gave, so existing
-- sub-admins keep exactly the access they had. The old flag columns are kept
-- for that fallback and are no longer written for new edits.
-- Safe to rerun: server.js also adds this column at boot.
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_permissions' AND COLUMN_NAME = 'permissions');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE admin_permissions ADD COLUMN permissions TEXT NULL',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
