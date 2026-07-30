-- Onboarding redesign: teacher-first path, approval gated at student invite.
--
-- Three additions, all additive — no existing column or table is altered in a
-- way that changes its meaning:
--
--   notifications.link   The approval notification has to send the owner back to
--                        the exact step they left off at (the student invite),
--                        not to the login page. Notifications were display-only
--                        before this, so there was nowhere to put a destination.
--
--   users.last_login_at  The onboarding milestone is "the teacher you invited
--                        logged in". Nothing recorded a login timestamp, so
--                        there was no way to know whether that had happened.
--
--   onboarding_drafts    While a company waits for student-invite approval they
--                        can pre-fill their roster/schedule. Drafts are NOT real
--                        users — that is the whole point of the gate — so they
--                        cannot live in `users` and need their own holding table.
--
-- The approval gate itself needs no schema change: companies.status already has
-- a 'pending' value, and it now means "signed up and fully usable, but not yet
-- cleared to invite real students".

ALTER TABLE notifications
  ADD COLUMN link VARCHAR(255) NULL;

ALTER TABLE users
  ADD COLUMN last_login_at TIMESTAMP NULL;

CREATE TABLE onboarding_drafts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  -- What the draft describes. 'teacher' and 'student' hold one person each;
  -- 'schedule' holds a free-text description of the intended class schedule.
  kind ENUM('teacher','student','schedule') NOT NULL,
  -- JSON blob, shape depends on kind. Kept as TEXT for consistency with
  -- audit_logs.details, which stores JSON the same way.
  payload TEXT NOT NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_company_kind (company_id, kind),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
