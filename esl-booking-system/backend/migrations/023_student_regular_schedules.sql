-- Students' agreed regular schedule: one row per weekly slot, each with its own
-- day, start time and (optional) teacher, e.g. Mon 7:00 PM with Anna and
-- Thu 5:30 PM with Ben.
--
-- Kept purely as a record, so the agreed slots aren't forgotten when a student
-- misses a few classes. Nothing reads it to book, deduct or restore sessions;
-- packages are untouched.
--
-- No FKs to users (same as half_credits) so the user hard-delete paths aren't
-- blocked; they clean these rows up themselves.
--
-- Safe to rerun: server.js also applies this at boot.
CREATE TABLE IF NOT EXISTS student_regular_schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  student_id INT NOT NULL,
  day_of_week VARCHAR(9) NOT NULL,
  start_time TIME NOT NULL,
  teacher_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rs_student (company_id, student_id),
  INDEX idx_rs_teacher (teacher_id),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);
