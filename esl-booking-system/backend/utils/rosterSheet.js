const { parse } = require('csv-parse/sync');
const ExcelJS = require('exceljs');

// Reading a roster spreadsheet, with none of the database or HTTP concerns.
// Kept separate from importRoutes so the messy part — other people's column
// headings — can be exercised on its own.

/** Normalise a heading to alphanumerics so "Guardian Name" == "guardian_name". */
function normaliseHeader(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const HEADER_ALIASES = {
    name: 'name',
    fullname: 'name',
    studentname: 'name',
    teachername: 'name',
    student: 'name',
    teacher: 'name',
    guardianname: 'guardian_name',
    guardian: 'guardian_name',
    parent: 'guardian_name',
    parentname: 'guardian_name',
    parentguardian: 'guardian_name',
    guardianparent: 'guardian_name',
    age: 'age',
    nationality: 'nationality',
    country: 'nationality',
    email: 'email',
    emailaddress: 'email',
    mail: 'email',
};

// Column order assumed when a file has no recognisable header row — the same
// order the import screen documents. Lets an admin paste bare values and import.
const POSITIONAL_COLUMNS = {
    students: ['name', 'guardian_name', 'age', 'nationality'],
    teachers: ['name', 'email'],
};

const FIELDS_FOR_TYPE = {
    students: ['name', 'guardian_name', 'age', 'nationality'],
    teachers: ['name', 'email'],
};

/** Flatten one exceljs cell value to plain text. */
function cellText(value) {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) {
        // A bare year typed into a date-formatted cell is the usual way an "age"
        // column turns into a date. Nothing sensible to recover — treat as empty.
        return '';
    }
    if (typeof value === 'object') {
        if (Array.isArray(value.richText)) return value.richText.map(r => r.text).join('');
        if (value.error) return '';
        if (value.text !== undefined) return String(value.text);          // hyperlink
        if (value.result !== undefined) return String(value.result);      // formula
        return '';
    }
    return String(value);
}

/** Read a CSV or XLSX buffer into a rectangular array of trimmed strings. */
async function readSheet(buffer, filename) {
    const name = String(filename || '').toLowerCase();

    if (name.endsWith('.csv')) {
        const rows = parse(buffer, {
            skip_empty_lines: true,
            trim: true,
            bom: true,
            relax_column_count: true,
            relax_quotes: true,
        });
        return rows.map(r => r.map(c => String(c ?? '').trim()));
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets.find(ws => ws.actualRowCount > 0) || workbook.worksheets[0];
    if (!sheet) return [];

    const rows = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
        const cells = [];
        // Walk by column index rather than row.values so a blank cell in the
        // middle of a row keeps its position and the column mapping holds.
        const width = Math.max(row.cellCount, row.actualCellCount);
        for (let c = 1; c <= width; c++) {
            cells.push(cellText(row.getCell(c).value).trim());
        }
        rows.push(cells);
    });
    return rows;
}

/**
 * Turn raw sheet rows into field-keyed records.
 * @returns {{records: object[], headerDetected: boolean, mapping: object, unknownColumns: string[]}}
 */
function mapRows(rawRows, type) {
    const known = FIELDS_FOR_TYPE[type];
    const nonEmpty = (rawRows || []).filter(r => r.some(c => c !== ''));
    if (nonEmpty.length === 0) {
        return { records: [], headerDetected: false, mapping: {}, unknownColumns: [] };
    }

    const first = nonEmpty[0];
    const firstMapped = first.map(c => HEADER_ALIASES[normaliseHeader(c)] || null);
    // Row 1 is a header only if it names a column we understand. A row reading
    // "Maria, Ana, 9, PH" has no header words in it and must not be eaten.
    const headerDetected = firstMapped.some(m => m && known.includes(m));

    const mapping = {};
    const unknownColumns = [];
    let dataRows;
    let firstDataLine;

    if (headerDetected) {
        firstMapped.forEach((field, idx) => {
            if (field && known.includes(field) && mapping[field] === undefined) {
                mapping[field] = idx;
            } else if (first[idx] !== '') {
                unknownColumns.push(first[idx]);
            }
        });
        dataRows = nonEmpty.slice(1);
        firstDataLine = 2;
    } else {
        POSITIONAL_COLUMNS[type].forEach((field, idx) => { mapping[field] = idx; });
        dataRows = nonEmpty;
        firstDataLine = 1;
    }

    const records = dataRows.map((cells, i) => {
        const rec = { row: firstDataLine + i };
        for (const field of known) {
            const idx = mapping[field];
            rec[field] = idx === undefined ? '' : String(cells[idx] ?? '').trim();
        }
        return rec;
    });

    return { records, headerDetected, mapping, unknownColumns };
}

/** Age is optional everywhere: non-numeric or out-of-range becomes null. */
function parseAge(text) {
    if (text === null || text === undefined || text === '') return null;
    const n = parseInt(String(text).trim(), 10);
    if (!Number.isFinite(n) || n < 1 || n > 120) return null;
    return n;
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

module.exports = {
    readSheet,
    mapRows,
    parseAge,
    isValidEmail,
    cellText,
    normaliseHeader,
    FIELDS_FOR_TYPE,
    POSITIONAL_COLUMNS,
};
