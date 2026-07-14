// Philippine time (UTC+8, no DST) helpers.
//
// appointment_date and other business datetimes are stored as naive PHT
// wall-clock values (db.js uses dateStrings: true so they come back as
// plain 'YYYY-MM-DD HH:mm:ss' strings). All comparisons against "now"
// are computed HERE from the UTC epoch — never from NOW()/CURDATE() in
// SQL (depends on the DB session timezone) and never from host-local
// Date parsing (depends on the server's TZ). This makes reminder windows
// identical on any host: Render, local dev on Windows, anywhere.

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;

// Current PHT wall-clock time, exposed as a Date whose UTC fields hold the
// PHT values (Date.now() is a UTC epoch, so this is host-TZ-independent).
function phtNow(offsetMs = 0) {
    return new Date(Date.now() + PHT_OFFSET_MS + offsetMs);
}

function toSqlDateTime(d) {
    return d.toISOString().slice(0, 19).replace('T', ' ');
}

// 'YYYY-MM-DD HH:mm:ss' in PHT, shifted by offsetMinutes from now.
function phtNowSql(offsetMinutes = 0) {
    return toSqlDateTime(phtNow(offsetMinutes * 60 * 1000));
}

// 'YYYY-MM-DD' in PHT, shifted by offsetDays from today.
function phtTodaySql(offsetDays = 0) {
    return phtNow(offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Format a stored PHT datetime string for display, e.g.
// '2026-07-03 14:30:00' -> 'Jul 3, 2026, 2:30 PM (PHT)'.
// Pure string parsing — the stored value already IS the wall-clock time to
// show, so no Date construction (which would parse in the host's TZ).
function formatPHT(appointmentDate) {
    const m = String(appointmentDate).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (!m) return `${appointmentDate} (PHT)`;
    const [, y, mo, d, h, mi] = m;
    const hour24 = Number(h);
    const ampm = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 % 12 || 12;
    return `${MONTHS[Number(mo) - 1]} ${Number(d)}, ${y}, ${hour12}:${mi} ${ampm} (PHT)`;
}

module.exports = { PHT_OFFSET_MS, phtNow, phtNowSql, phtTodaySql, formatPHT };
