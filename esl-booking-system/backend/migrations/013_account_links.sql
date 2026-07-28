-- Links two accounts owned by the same person (e.g. an admin who also teaches),
-- so they can switch between them from the profile menu without logging out.
--
-- The pair is stored normalised as user_id_a < user_id_b, so a single row
-- covers both switch directions and the UNIQUE key prevents duplicates.
-- A link is only created after the owner proves they know the other account's
-- password (see POST /api/auth/link-account).
CREATE TABLE `account_links` (
  `id` int NOT NULL AUTO_INCREMENT,
  `company_id` int NOT NULL,
  `user_id_a` int NOT NULL,
  `user_id_b` int NOT NULL,
  `created_by` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_account_pair` (`user_id_a`,`user_id_b`),
  KEY `idx_user_id_b` (`user_id_b`),
  CONSTRAINT `account_links_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `account_links_ibfk_2` FOREIGN KEY (`user_id_a`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `account_links_ibfk_3` FOREIGN KEY (`user_id_b`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
