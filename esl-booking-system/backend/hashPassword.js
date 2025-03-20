import bcrypt from "bcrypt";

const saltRounds = 10; // Defines the strength of the hashing (higher = slower, more secure)

/**
 * Hash a plain text password before storing it in the database.
 * @param {string} password - The user's raw password
 * @returns {Promise<string>} - Hashed password
 */
export async function hashPassword(password) {
  const hashedPassword = await bcrypt.hash(password, saltRounds);
  return hashedPassword;
}

// Example usage
async function run() {
  const password = "jillian";
  const hashed = await hashPassword(password);
  console.log("Hashed Password:", hashed);
}

run();
