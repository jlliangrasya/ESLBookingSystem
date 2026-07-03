// Verifies the PHT time helpers used by the scheduler are correct and
// independent of the host timezone. Run under several TZs to prove it:
//   TZ=UTC node scripts/verify-scheduler-time.js
//   TZ=Asia/Manila node scripts/verify-scheduler-time.js
//   TZ=America/New_York node scripts/verify-scheduler-time.js
// Output (except for millisecond drift) must be identical in all three.

const { phtNow, phtNowSql, phtTodaySql, formatPHT } = require('../utils/phtTime');

let failures = 0;
function check(label, actual, expected) {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: ${actual}${ok ? '' : `  (expected ${expected})`}`);
}

// Ground truth via a completely different code path: Intl with an explicitly
// pinned Asia/Manila zone (never affected by TZ env / host settings).
function intlPhtNowSql() {
    const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
    const hour = p.hour === '24' ? '00' : p.hour; // some ICU versions emit 24:00
    return `${p.year}-${p.month}-${p.day} ${hour}:${p.minute}:${p.second}`;
}

console.log(`Host TZ: ${process.env.TZ || '(system default)'} — Intl resolves to ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);

// 1. phtNowSql must agree with Intl's Asia/Manila clock (±2s for run time)
const ours = phtNowSql();
const truth = intlPhtNowSql();
const driftSec = Math.abs((Date.parse(ours.replace(' ', 'T') + 'Z') - Date.parse(truth.replace(' ', 'T') + 'Z')) / 1000);
check('phtNowSql matches Intl Asia/Manila clock', driftSec <= 2, true);
console.log(`      ours=${ours}  intl=${truth}`);

// 2. phtTodaySql must be the date part of phtNowSql
check('phtTodaySql is date of phtNowSql', phtTodaySql(), ours.slice(0, 10));

// 3. Window offsets (±50ms tolerance: base and offset use separate Date.now() calls)
const base = phtNow().getTime();
const near = (actual, expected) => Math.abs(actual - expected) < 50;
check('phtNowSql(+40min) is +40min', near(phtNow(40 * 60000).getTime() - base, 2400000), true);
check('phtNowSql(+4h) is +4h', near(phtNow(4 * 60 * 60000).getTime() - base, 14400000), true);
check('phtNowSql(+5.5h) is +5.5h', near(phtNow(5.5 * 60 * 60000).getTime() - base, 19800000), true);

// 4. formatPHT: pure string formatting of stored PHT datetimes
check('formatPHT afternoon', formatPHT('2026-07-03 14:30:00'), 'Jul 3, 2026, 2:30 PM (PHT)');
check('formatPHT just after midnight', formatPHT('2026-01-05 00:05:00'), 'Jan 5, 2026, 12:05 AM (PHT)');
check('formatPHT noon', formatPHT('2026-12-31 12:00:00'), 'Dec 31, 2026, 12:00 PM (PHT)');
check('formatPHT 11 PM', formatPHT('2025-02-28 23:45:00'), 'Feb 28, 2025, 11:45 PM (PHT)');
check('formatPHT ISO T separator', formatPHT('2026-07-03T09:00:00'), 'Jul 3, 2026, 9:00 AM (PHT)');

// 5. Example reminder windows as the scheduler would compute them right now
console.log(`      30-min window: ${phtNowSql(0)} → ${phtNowSql(40)} (PHT)`);
console.log(`      5-hour window: ${phtNowSql(4 * 60)} → ${phtNowSql(5.5 * 60)} (PHT)`);

if (failures > 0) {
    console.error(`\n${failures} check(s) FAILED`);
    process.exit(1);
}
console.log('\nAll checks passed');
