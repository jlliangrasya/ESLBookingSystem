const jwt = require('jsonwebtoken');
const pool = require('../db');
require('dotenv').config();

/**
 * Resolve a user's company gating state. Throws an error carrying `.status`
 * when the company blocks sign-in outright.
 * Shared by /login, /switch-account and the super admin company switcher so
 * they can't drift apart.
 */
async function resolveCompanyState(user) {
    let trialExpired = false;
    let companyStatus = 'active';
    let companyName = null;

    if (user.role !== 'super_admin' && user.company_id) {
        const [[company]] = await pool.query(
            'SELECT status, trial_ends_at, company_name FROM companies WHERE id = ?',
            [user.company_id]
        );
        if (company) companyName = company.company_name || null;
        if (company && company.status === 'locked') {
            // Allow login but flag — frontend redirects to locked page
            companyStatus = 'locked';
        } else if (company && company.status === 'suspended') {
            // Allow login but flag — frontend redirects to suspended page
            companyStatus = 'suspended';
        } else if (company && company.status === 'pending') {
            // 'pending' means "registered and fully usable, but not yet cleared to
            // invite real students" — it is NOT a sign-in block. The only thing it
            // gates is POST /api/admin/students. Sign in normally and let the
            // frontend surface the gate at the invite step.
            companyStatus = 'pending';
            if (company.trial_ends_at && new Date(company.trial_ends_at) < new Date()) {
                trialExpired = true;
            }
        } else if (!company || company.status !== 'active') {
            // Still a hard stop for 'rejected' and for a missing company row.
            const err = new Error('Your company account is not active');
            err.status = 403;
            throw err;
        } else if (company.trial_ends_at && new Date(company.trial_ends_at) < new Date()) {
            trialExpired = true;
        }
    }

    return { trialExpired, companyStatus, companyName };
}

/**
 * Sign a JWT and build the session payload the frontend stores in AuthContext.
 * `extraClaims` lets the super admin company switcher stamp `impersonated_by`
 * into the token so the session stays traceable to the real person.
 */
function buildSession(user, { trialExpired, companyStatus, companyName }, { extraClaims = {}, expiresIn = '30d' } = {}) {
    const token = jwt.sign(
        { id: user.id, role: user.role, company_id: user.company_id, ...extraClaims },
        process.env.JWT_SECRET,
        { expiresIn }
    );

    return {
        token,
        user: {
            id: user.id,
            name: user.name,
            role: user.role,
            company_id: user.company_id,
            company_name: companyName,
            timezone: user.timezone || 'UTC',
            is_owner: user.is_owner ?? false,
        },
        trial_expired: trialExpired,
        company_status: companyStatus,
    };
}

module.exports = { resolveCompanyState, buildSession };
