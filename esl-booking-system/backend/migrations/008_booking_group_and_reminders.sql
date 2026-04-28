-- Migration 008: Multi-slot booking group ID + 5-hour reminder tracking
-- Run this against your local MySQL database (esl_booking).
-- Safe to re-run: all ALTER statements check for column/index existence first.

-- ── booking_group_id ──────────────────────────────────────────────────────────
-- Links the two 30-min booking rows that make up one 50-minute class.
-- NULL for solo (25-min) classes.
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'booking_group_id');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE bookings ADD COLUMN booking_group_id VARCHAR(36) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND INDEX_NAME = 'idx_bookings_group');
SET @sql = IF(@idx_exists = 0,
    'ALTER TABLE bookings ADD INDEX idx_bookings_group (booking_group_id)',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── reminded_5h ───────────────────────────────────────────────────────────────
-- Prevents duplicate 5-hour class reminders per booking row.
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'reminded_5h');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE bookings ADD COLUMN reminded_5h BOOLEAN DEFAULT FALSE',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND INDEX_NAME = 'idx_bookings_reminder_5h');
SET @sql = IF(@idx_exists = 0,
    'ALTER TABLE bookings ADD INDEX idx_bookings_reminder_5h (status, reminded_5h, appointment_date)',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Fix existing consecutive-slot bookings with NULL booking_group_id ─────────
-- Finds pairs of bookings for the same student package + teacher where one slot
-- is exactly 30 minutes after the other (50-min class pattern), and assigns them
-- a shared UUID so the UI can group them into a single entry.
-- Only touches rows where booking_group_id IS NULL and status != 'cancelled'.

DROP TEMPORARY TABLE IF EXISTS _multi_slot_fix;

CREATE TEMPORARY TABLE _multi_slot_fix AS
SELECT b1.id AS id1, b2.id AS id2, UUID() AS group_id
FROM bookings b1
INNER JOIN bookings b2 ON (
    b2.student_package_id = b1.student_package_id
    AND b2.teacher_id      = b1.teacher_id
    AND b2.appointment_date = DATE_ADD(b1.appointment_date, INTERVAL 30 MINUTE)
    AND b2.booking_group_id IS NULL
    AND b1.booking_group_id IS NULL
    AND b1.status NOT IN ('cancelled')
    AND b2.status NOT IN ('cancelled')
);

UPDATE bookings b
INNER JOIN _multi_slot_fix f ON b.id = f.id1
SET b.booking_group_id = f.group_id;

UPDATE bookings b
INNER JOIN _multi_slot_fix f ON b.id = f.id2
SET b.booking_group_id = f.group_id;

DROP TEMPORARY TABLE IF EXISTS _multi_slot_fix;
