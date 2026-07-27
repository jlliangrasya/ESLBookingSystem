-- Teacher personal notes on their weekly calendar (e.g. "LUNCH")
-- A note can only exist on a closed slot: saving a note always closes the
-- slot first (see POST /api/teacher/notes), it never marks a slot as open.
CREATE TABLE `teacher_notes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `company_id` int NOT NULL,
  `teacher_id` int NOT NULL,
  `note_date` date NOT NULL,
  `slot_time` time NOT NULL,
  `note_text` varchar(100) NOT NULL,
  `admin_visibility` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_note_slot` (`company_id`,`teacher_id`,`note_date`,`slot_time`),
  CONSTRAINT `teacher_notes_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `teacher_notes_ibfk_2` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
