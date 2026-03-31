const jwt = require("jsonwebtoken");
const pool = require("../db");

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
        return res.status(403).json({ message: "Access denied, token missing" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
        return res.status(403).json({ message: "Access denied, token missing" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;

        // Check if user is still active (immediate revocation on deactivation/deletion)
        const [[user]] = await pool.query(
            'SELECT is_active FROM users WHERE id = ?',
            [decoded.id]
        );
        if (!user) {
            return res.status(401).json({ message: 'Account no longer exists.' });
        }
        if (user.is_active === false || user.is_active === 0) {
            return res.status(403).json({ message: 'Your account has been deactivated. Please contact your administrator.' });
        }

        // Check company status and trial expiry for non-super_admin users
        if (decoded.company_id) {
            const [[company]] = await pool.query(
                'SELECT status, trial_ends_at FROM companies WHERE id = ?',
                [decoded.company_id]
            );
            if (!company || company.status !== 'active') {
                return res.status(403).json({ message: 'Your company account is not active.' });
            }
            if (company.trial_ends_at && new Date(company.trial_ends_at) < new Date()) {
                return res.status(403).json({ message: 'Your free trial has expired. Please upgrade your plan.' });
            }
        }

        next();
    } catch (error) {
        return res.status(401).json({ message: "Invalid token" });
    }
};

// Basic variant: JWT-only, skips trial/status check (used for upgrade-request endpoints)
const authenticateTokenBasic = async (req, res, next) => {
    const authHeader = req.headers["authorization"];
    if (!authHeader) return res.status(403).json({ message: "Access denied, token missing" });
    const token = authHeader.split(" ")[1];
    if (!token) return res.status(403).json({ message: "Access denied, token missing" });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ message: "Invalid token" });
    }
};

authenticateToken.basic = authenticateTokenBasic;
module.exports = authenticateToken;
