-- companies.is_setup — "this account is already set up".
--
-- TRUE once the company has an active package, an active teacher, and at least
-- one submitted class record (class_reports). It is sticky: once set it never
-- goes back to FALSE, even if a package or teacher is later removed — the
-- account was proven to work, and the welcome tour should not reappear.
--
-- Set lazily by GET /api/onboarding/status; the UPDATE below backfills
-- companies that already qualify.
--
-- Safe to rerun: server.js also adds the column at boot.
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'is_setup');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE companies ADD COLUMN is_setup BOOLEAN NOT NULL DEFAULT FALSE',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE companies c
SET c.is_setup = TRUE
WHERE c.is_setup = FALSE
  AND EXISTS (SELECT 1 FROM tutorial_packages p WHERE p.company_id = c.id AND p.is_active = TRUE)
  AND EXISTS (SELECT 1 FROM users u WHERE u.company_id = c.id AND u.role = 'teacher' AND u.is_active = TRUE)
  AND EXISTS (SELECT 1 FROM class_reports r WHERE r.company_id = c.id);
