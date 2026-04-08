const jwt = require("jsonwebtoken");
const pool = require("../db");

// ── In-memory cache (60-second TTL) ─────────────────────────────────────────
// Eliminates 2 DB queries per authenticated request.
// Cache is invalidated naturally by TTL. Deactivation takes effect within 60s.
const authCache = new Map(); // key: "user:<id>" or "company:<id>" → { data, expiresAt }
const CACHE_TTL = 60 * 1000; // 60 seconds

function cacheGet(key) {
    const entry = authCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { authCache.delete(key); return null; }
    return entry.data;
}
function cacheSet(key, data) {
    authCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
    // Prevent unbounded growth — prune if > 5000 entries
    if (authCache.size > 5000) {
        const now = Date.now();
        for (const [k, v] of authCache) { if (now > v.expiresAt) authCache.delete(k); }
    }
}
// Call this when deactivating/deleting users or changing company status
function invalidateAuthCache(userId, companyId) {
    if (userId) authCache.delete(`user:${userId}`);
    if (companyId) authCache.delete(`company:${companyId}`);
}
// ─────────────────────────────────────────────────────────────────────────────

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

        try {
            // Check user is_active (cached)
            let user = cacheGet(`user:${decoded.id}`);
            if (!user) {
                const [[row]] = await pool.query(
                    'SELECT is_active FROM users WHERE id = ?',
                    [decoded.id]
                );
                user = row || null;
                if (user) cacheSet(`user:${decoded.id}`, user);
            }
            if (!user) {
                return res.status(401).json({ message: 'Account no longer exists.' });
            }
            if (user.is_active === false || user.is_active === 0) {
                return res.status(403).json({ message: 'Your account has been deactivated. Please contact your administrator.' });
            }

            // Check company status (cached)
            if (decoded.company_id) {
                let company = cacheGet(`company:${decoded.company_id}`);
                if (!company) {
                    const [[row]] = await pool.query(
                        'SELECT status, trial_ends_at FROM companies WHERE id = ?',
                        [decoded.company_id]
                    );
                    company = row || null;
                    if (company) cacheSet(`company:${decoded.company_id}`, company);
                }
                if (!company || company.status !== 'active') {
                    return res.status(403).json({ message: 'Your company account is not active.' });
                }
                if (company.trial_ends_at && new Date(company.trial_ends_at) < new Date()) {
                    return res.status(403).json({ message: 'Your free trial has expired. Please upgrade your plan.' });
                }
            }
        } catch (dbErr) {
            // DB query failed (cold start, timeout) — don't log user out
        }

        next();
    } catch (error) {
        return res.status(401).json({ message: "Invalid or expired token" });
    }
};

// Basic variant: JWT-only, skips trial/status check
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
authenticateToken.invalidateAuthCache = invalidateAuthCache;
module.exports = authenticateToken;
