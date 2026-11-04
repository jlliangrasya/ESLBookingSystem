// "Deleting" an account archives it rather than removing the users row.
//
// Bookings, class reports, packages, payments, feedback and audit entries all
// point at the user id, and they are the school's records — a class a student
// finished, or a report a teacher wrote, must still exist after that person
// leaves. So the row stays and only the account itself is shut down:
//   - is_active = FALSE  → can't log in, frees the plan seat, drops out of
//                           every "active" list and teacher/student picker
//   - deleted_at = NOW() → hidden from rosters even where inactive accounts
//                           are normally shown (e.g. the student list)
//   - email rewritten    → the address is unique system-wide, so it is freed
//                           for a new account (a returning teacher, say)
// Names are left untouched so history still reads "Taught by Ms. Ana".
async function archiveUser(conn, userId) {
  const [result] = await conn.query(
    `UPDATE users
        SET is_active = FALSE,
            deleted_at = NOW(),
            email = LEFT(CONCAT('deleted-', id, '-', email), 255),
            reset_token = NULL,
            reset_token_expires = NULL
      WHERE id = ? AND deleted_at IS NULL`,
    [userId]
  );
  return result.affectedRows > 0;
}

module.exports = { archiveUser };
