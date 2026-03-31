-- Migration 002: Add ON DELETE CASCADE to critical foreign key constraints
-- This prevents orphaned data when parent rows are deleted.
-- Date: 2026-03-31

-- bookings → student_packages
ALTER TABLE bookings DROP FOREIGN KEY bookings_ibfk_2;
ALTER TABLE bookings ADD CONSTRAINT bookings_ibfk_2
  FOREIGN KEY (student_package_id) REFERENCES student_packages(id) ON DELETE CASCADE;

-- class_reports → bookings
ALTER TABLE class_reports DROP FOREIGN KEY class_reports_ibfk_1;
ALTER TABLE class_reports ADD CONSTRAINT class_reports_ibfk_1
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;

-- student_packages → users (student)
ALTER TABLE student_packages DROP FOREIGN KEY student_packages_ibfk_2;
ALTER TABLE student_packages ADD CONSTRAINT student_packages_ibfk_2
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;

-- student_feedback → users (student)
ALTER TABLE student_feedback DROP FOREIGN KEY student_feedback_ibfk_1;
ALTER TABLE student_feedback ADD CONSTRAINT student_feedback_ibfk_1
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;

-- teacher_leaves → users (teacher)
ALTER TABLE teacher_leaves DROP FOREIGN KEY teacher_leaves_ibfk_1;
ALTER TABLE teacher_leaves ADD CONSTRAINT teacher_leaves_ibfk_1
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE;

-- teacher_available_slots → users (teacher)
ALTER TABLE teacher_available_slots DROP FOREIGN KEY teacher_available_slots_ibfk_2;
ALTER TABLE teacher_available_slots ADD CONSTRAINT teacher_available_slots_ibfk_2
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE;

-- closed_slots → users (teacher)
ALTER TABLE closed_slots DROP FOREIGN KEY closed_slots_ibfk_2;
ALTER TABLE closed_slots ADD CONSTRAINT closed_slots_ibfk_2
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE;

-- waitlist → users (student)
ALTER TABLE waitlist DROP FOREIGN KEY waitlist_ibfk_2;
ALTER TABLE waitlist ADD CONSTRAINT waitlist_ibfk_2
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;

-- session_adjustments → student_packages
ALTER TABLE session_adjustments DROP FOREIGN KEY session_adjustments_ibfk_2;
ALTER TABLE session_adjustments ADD CONSTRAINT session_adjustments_ibfk_2
  FOREIGN KEY (student_package_id) REFERENCES student_packages(id) ON DELETE CASCADE;

-- Set teacher_id to NULL on bookings when teacher is deleted (preserve booking history)
ALTER TABLE bookings DROP FOREIGN KEY bookings_ibfk_3;
ALTER TABLE bookings ADD CONSTRAINT bookings_ibfk_3
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL;

-- Set teacher_id to NULL on student_packages when teacher is deleted
ALTER TABLE student_packages DROP FOREIGN KEY student_packages_ibfk_4;
ALTER TABLE student_packages ADD CONSTRAINT student_packages_ibfk_4
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL;

-- Set teacher_id to NULL on student_feedback when teacher is deleted
ALTER TABLE student_feedback DROP FOREIGN KEY student_feedback_ibfk_3;
ALTER TABLE student_feedback ADD CONSTRAINT student_feedback_ibfk_3
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL;
