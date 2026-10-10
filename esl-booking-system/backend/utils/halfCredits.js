const pool = require('../db');
const { attendeeSql, packageStudentIds } = require('./sharedPackages');
const notify = require('./notify');
const logger = require('./logger');

/**
 * Late absence notice → half-class credit (per-company policy, migration 019).
 *
 * A student who notifies the team within `companies.late_notice_minutes` after
 * class start earns a 0.5 credit on the package the class was booked on. The
 * class's session was already deducted at booking time, so nothing about
 * sessions_remaining changes when the credit is created — halves live in
 * half_credits and only ever turn into WHOLE sessions:
 *   - two open halves on the same package combine automatically (+1 session)
 *   - one half + an admin-confirmed payment of half the class price (+1 session)
 * Open halves expire once their package is used up. Non-refundable.
 */

/** Thrown for rule violations; routes turn these into a 400 with the message. */
class HalfCreditError extends Error {}

/**
 * Scope of a booking's group (every 30-min slot of one class), as a WHERE clause.
 */
function groupScope(booking, companyId) {
    return booking.booking_group_id
        ? { sql: 'booking_group_id = ? AND company_id = ?', params: [booking.booking_group_id, companyId] }
        : { sql: 'id = ? AND company_id = ?', params: [booking.id, companyId] };
}

/**
 * Validate the late-notice policy for a booking and return the notice datetime.
 * `noticeMinutes` = how many minutes after class start the student notified.
 * Returns { classStart, noticeAt, firstBookingId } using the group's first slot.
 */
async function resolveLateNotice(conn, booking, companyId, noticeMinutes) {
    const [[company]] = await conn.query(
        'SELECT late_notice_enabled, late_notice_minutes FROM companies WHERE id = ?',
        [companyId]
    );
    if (!company || !company.late_notice_enabled) {
        throw new HalfCreditError('Late absence notice is not enabled for this company.');
    }
    const windowMin = Number(company.late_notice_minutes) || 15;
    const mins = Number(noticeMinutes);
    if (!Number.isInteger(mins) || mins < 0) {
        throw new HalfCreditError('Enter how many minutes after class start the student notified (0 or more).');
    }
    if (mins > windowMin) {
        throw new HalfCreditError(`The notice came ${mins} minutes after class start — beyond the ${windowMin}-minute window, so the student is fully absent. Use "Student absent" instead.`);
    }

    const scope = groupScope(booking, companyId);
    const [[first]] = await conn.query(
        `SELECT id, appointment_date, DATE_FORMAT(TIMESTAMPADD(MINUTE, ?, appointment_date), '%Y-%m-%d %H:%i:%s') AS notice_at
         FROM bookings WHERE ${scope.sql} ORDER BY appointment_date ASC LIMIT 1`,
        [mins, ...scope.params]
    );
    return { classStart: first.appointment_date, noticeAt: first.notice_at, firstBookingId: first.id, windowMin };
}

/**
 * Create an open half credit for a late-notice class, then combine it with
 * another open half on the same package if there is one. Must run inside the
 * caller's transaction. Returns { creditId, combined, valueAmount, currency }.
 */
async function createHalfCredit(conn, { companyId, booking, firstBookingId, userId }) {
    const [[pkg]] = await conn.query(
        `SELECT sp.id, sp.student_id, tp.price, tp.session_limit, tp.currency
         FROM student_packages sp JOIN tutorial_packages tp ON tp.id = sp.package_id
         WHERE sp.id = ? AND sp.company_id = ? FOR UPDATE`,
        [booking.student_package_id, companyId]
    );
    if (!pkg) throw new HalfCreditError('Student package not found.');

    const [[attendee]] = await conn.query(
        `SELECT ${attendeeSql('b', 'sp')} AS student_id
         FROM bookings b JOIN student_packages sp ON sp.id = b.student_package_id WHERE b.id = ?`,
        [booking.id]
    );

    const perClass = Number(pkg.session_limit) > 0 ? Number(pkg.price || 0) / Number(pkg.session_limit) : 0;
    const valueAmount = Math.round((perClass / 2) * 100) / 100;

    const studentId = attendee?.student_id ?? pkg.student_id;
    const [ins] = await conn.query(
        `INSERT INTO half_credits (company_id, student_package_id, student_id, booking_id, status, value_amount, currency, created_by)
         VALUES (?, ?, ?, ?, 'open', ?, ?, ?)`,
        [companyId, pkg.id, studentId, firstBookingId, valueAmount, pkg.currency || null, userId]
    );
    const creditId = ins.insertId;

    // Another open half on the same package? Two halves make one class.
    const [[other]] = await conn.query(
        `SELECT id FROM half_credits
         WHERE company_id = ? AND student_package_id = ? AND status = 'open' AND id <> ?
         ORDER BY created_at ASC, id ASC LIMIT 1 FOR UPDATE`,
        [companyId, pkg.id, creditId]
    );
    let combined = false;
    if (other) {
        await conn.query(
            `UPDATE half_credits SET status = 'combined', combined_with_id = ?, redeemed_by = ?, redeemed_at = NOW() WHERE id = ?`,
            [creditId, userId, other.id]
        );
        await conn.query(
            `UPDATE half_credits SET status = 'combined', combined_with_id = ?, redeemed_by = ?, redeemed_at = NOW() WHERE id = ?`,
            [other.id, userId, creditId]
        );
        await conn.query('UPDATE student_packages SET sessions_remaining = sessions_remaining + 1 WHERE id = ?', [pkg.id]);
        await conn.query(
            `INSERT INTO session_adjustments (company_id, student_package_id, adjusted_by, adjustment, remarks, created_at)
             VALUES (?, ?, ?, 1, ?, NOW())`,
            [companyId, pkg.id, userId, 'Two half credits (late absence notices) combined into 1 class']
        );
        combined = true;
    }

    return { creditId, combined, valueAmount, currency: pkg.currency || null, studentPackageId: pkg.id, studentId };
}

/**
 * Undo the half credit of a booking whose attendance is being changed away from
 * "late notice". Only an OPEN credit can be removed — once it has been combined
 * or paid, the session it produced may already be used. Must run in a transaction.
 */
async function removeHalfCreditForBooking(conn, booking, companyId) {
    const scope = groupScope(booking, companyId);
    const [credits] = await conn.query(
        `SELECT id, status FROM half_credits
         WHERE company_id = ? AND booking_id IN (SELECT id FROM bookings WHERE ${scope.sql})
         FOR UPDATE`,
        [companyId, ...scope.params]
    );
    const locked = credits.find(c => c.status === 'combined' || c.status === 'paid');
    if (locked) {
        throw new HalfCreditError(`This class's half credit was already ${locked.status === 'paid' ? 'redeemed by payment' : 'combined into a full class'}, so its attendance can't be changed from "Late notice". Void or adjust sessions manually instead.`);
    }
    if (credits.length) {
        await conn.query('DELETE FROM half_credits WHERE id IN (?)', [credits.map(c => c.id)]);
    }
    return credits.length;
}

/**
 * Expire open halves whose package is used up: no sessions left and no class
 * still booked (pending/confirmed, i.e. not yet done or cancelled).
 * Returns the number of credits expired.
 */
async function expireUsedUpPackages() {
    const [result] = await pool.query(
        `UPDATE half_credits hc
         JOIN student_packages sp ON sp.id = hc.student_package_id
         SET hc.status = 'expired', hc.redeemed_at = NOW()
         WHERE hc.status = 'open'
           AND sp.sessions_remaining <= 0
           AND NOT EXISTS (
             SELECT 1 FROM bookings b
             WHERE b.student_package_id = sp.id AND b.status IN ('pending', 'confirmed')
           )`
    );
    return result.affectedRows;
}

function fmtMoney(amount, currency) {
    return `${currency ? currency + ' ' : ''}${Number(amount || 0).toFixed(2)}`;
}

/**
 * Tell the package's students and the company admins about a new half credit.
 * Fire-and-forget; call after commit. `excludeUserId` skips the person who
 * recorded it.
 */
async function notifyHalfCredit({ companyId, booking, halfCredit, excludeUserId }) {
    try {
        const [studentIds, [admins]] = await Promise.all([
            packageStudentIds(booking.student_package_id),
            pool.query("SELECT id FROM users WHERE company_id = ? AND role = 'company_admin'", [companyId]),
        ]);
        const studentMsg = halfCredit.combined
            ? 'A late absence notice earned you a half credit. Together with your earlier half credit, 1 class has been returned to your package.'
            : `A late absence notice earned you a half credit (0.5 class). Get another half credit, or pay ${fmtMoney(halfCredit.valueAmount, halfCredit.currency)}, to turn it into 1 full class. Half credits are not refundable.`;
        const adminMsg = halfCredit.combined
            ? 'A late absence notice was recorded. Two half credits were combined and 1 class was returned to the package.'
            : `A late absence notice was recorded. The student now has a half credit (worth ${fmtMoney(halfCredit.valueAmount, halfCredit.currency)}).`;

        for (const id of studentIds) {
            if (id === excludeUserId) continue;
            notify({ userId: id, companyId, type: 'late_notice_half_credit', title: 'Half credit added', message: studentMsg, link: '/studentdashboard' });
        }
        for (const a of admins) {
            if (a.id === excludeUserId) continue;
            notify({ userId: a.id, companyId, type: 'late_notice_half_credit', title: 'Late absence notice', message: adminMsg, link: `/admin/students/${halfCredit.studentId}` });
        }
    } catch (err) {
        logger.error('notifyHalfCredit failed', { error: err.message });
    }
}

module.exports = {
    HalfCreditError,
    fmtMoney,
    notifyHalfCredit,
    groupScope,
    resolveLateNotice,
    createHalfCredit,
    removeHalfCreditForBooking,
    expireUsedUpPackages,
};
