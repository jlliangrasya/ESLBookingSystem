-- Teachers' fixed weekly timetable: one row per 30-minute slot the teacher is
-- regularly OPEN (e.g. Monday 09:00); any slot without a row is regularly closed.
--
-- Like student_regular_schedules this is a record only, shown on the calendar's
-- Regular Schedule view and the Teachers list so admins can spot a teacher's
-- regular vacancies when placing new students. It never opens or closes real
-- slots in teacher_available_slots.
--
-- Safe to rerun: server.js also applies this at boot.
CREATE TABLE IF NOT EXISTS teacher_regular_slots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  teacher_id INT NOT NULL,
  day_of_week VARCHAR(9) NOT NULL,
  slot_time TIME NOT NULL,
  UNIQUE KEY unique_teacher_regular_slot (company_id, teacher_id, day_of_week, slot_time),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);
