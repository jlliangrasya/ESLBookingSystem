-- Private (unlisted) subscription plans.
--
-- is_public = FALSE keeps a plan active and assignable by the super admin
-- (Change Plan dialog), but hides it from the public plan list used by the
-- registration, upgrade and suspended pages. Use it for custom deals made
-- for a single company. is_active still controls whether a plan can be used at all.
--
-- Safe to rerun: server.js also applies this at boot.
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscription_plans' AND COLUMN_NAME = 'is_public');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE subscription_plans ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT TRUE',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
