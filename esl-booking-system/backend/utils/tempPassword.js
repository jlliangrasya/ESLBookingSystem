const crypto = require('crypto');

// Ambiguous characters (0/O, 1/l/I) are left out — these passwords get read off a
// screen and retyped, or pasted into a chat app, so confusable glyphs cost more
// than the handful of bits of entropy they'd add.
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generate a temporary password for an invited account.
 *
 * Used when a company admin adds a teacher without typing a password — the point
 * of the onboarding flow is that adding a teacher needs nothing but a name and an
 * email, so the password has to come from somewhere.
 *
 * Uses crypto.randomInt for a uniform, unbiased pick per character (`% length`
 * over random bytes would skew toward the start of the alphabet).
 */
function generateTempPassword(length = 10) {
    let out = '';
    for (let i = 0; i < length; i++) {
        out += ALPHABET[crypto.randomInt(ALPHABET.length)];
    }
    return out;
}

module.exports = { generateTempPassword };
