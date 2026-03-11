const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

/**
 * Send an email.
 * Falls back to logging if SMTP is not configured.
 */
async function sendMail({ to, subject, html }) {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
        console.log(`[MAIL - no SMTP configured] To: ${to} | Subject: ${subject}`);
        return;
    }
    await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to,
        subject,
        html,
    });
}

module.exports = { sendMail };
