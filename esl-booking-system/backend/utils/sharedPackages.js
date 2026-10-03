const pool = require('../db');

/**
 * Shared packages (e.g. siblings using one package their parent bought).
 *
 * A package still has one owner (student_packages.student_id). Other students
 * who may book against it are listed in student_package_members. Every booking
 * records who actually attends in bookings.attendee_id; NULL means the package
 * owner, which is what every booking made before this feature resolves to.
 */

/** SQL expression for the student who attends a booking. */
const attendeeSql = (b = 'b', sp = 'sp') => `COALESCE(${b}.attendee_id, ${sp}.student_id)`;

/**
 * SQL condition: the student bound to the placeholders may use package `sp`
 * (they own it, or it is shared with them). Uses TWO placeholders — pass the
 * student id twice.
 */
const canUsePackageSql = (sp = 'sp') =>
    `(${sp}.student_id = ? OR EXISTS (SELECT 1 FROM student_package_members spm
        WHERE spm.student_package_id = ${sp}.id AND spm.student_id = ?))`;

/** True if the student owns or is a member of the package. */
async function canUsePackage(studentId, studentPackageId, conn = pool) {
    const [[row]] = await conn.query(
        `SELECT sp.id FROM student_packages sp WHERE sp.id = ? AND ${canUsePackageSql('sp')}`,
        [studentPackageId, studentId, studentId]
    );
    return !!row;
}

/** Owner + members of a package, owner first. */
async function packageStudentIds(studentPackageId, conn = pool) {
    const [rows] = await conn.query(
        `SELECT student_id FROM student_packages WHERE id = ?
         UNION
         SELECT student_id FROM student_package_members WHERE student_package_id = ?`,
        [studentPackageId, studentPackageId]
    );
    return rows.map(r => r.student_id);
}

module.exports = { attendeeSql, canUsePackageSql, canUsePackage, packageStudentIds };
