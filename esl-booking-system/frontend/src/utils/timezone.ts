import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

const TZ_KEY = 'userTimezone';
const FIXED_TZ = 'Asia/Manila';

/** Get the user's timezone — from localStorage, or auto-detect from browser */
export function getUserTimezone(): string {
    return FIXED_TZ;
}

/** Persist a timezone choice */
export function setUserTimezone(tz: string): void {
    localStorage.setItem(TZ_KEY, FIXED_TZ);
}

/**
 * Format a UTC date string (ISO or MySQL DATETIME) in the user's timezone.
 * @param utcStr  — e.g. "2024-01-15T10:00:00.000Z" or "2024-01-15 10:00:00"
 * @param fmt     — date-fns format string, default "MMM d, yyyy h:mm a"
 * @param tz      — override timezone (defaults to getUserTimezone())
 */
export function fmtDate(utcStr: string, fmt = "MMM d, yyyy h:mm a", tz?: string): string {
    if (!utcStr) return '—';
    try {
        const timezone = tz || getUserTimezone();
        // Treat stored DATETIME as local (no UTC conversion)
        const normalized = utcStr.includes('T') ? utcStr : utcStr.replace(' ', 'T');
        return formatInTimeZone(new Date(normalized), timezone, fmt);
    } catch {
        return utcStr;
    }
}

/** Normalize a UTC string (ISO or MySQL DATETIME) into a Date object */
export function parseUTC(utcStr: string): Date | null {
    if (!utcStr) return null;
    try {
        const normalized = utcStr.includes('T') ? utcStr : utcStr.replace(' ', 'T');
        return new Date(normalized);
    } catch {
        return null;
    }
}

/** Format just the date portion */
export function fmtDateOnly(utcStr: string, tz?: string): string {
    return fmtDate(utcStr, 'MMM d, yyyy', tz);
}

/** Format just the time portion */
export function fmtTime(utcStr: string, tz?: string): string {
    return fmtDate(utcStr, 'hh:mm a', tz);
}

/**
 * Convert a local date + time (in user's timezone) to a UTC ISO string for sending to the backend.
 * @param dateStr — "2024-01-15"
 * @param timeStr — "19:00"
 * @param tz      — timezone (defaults to getUserTimezone())
 */
export function localToUTC(dateStr: string, timeStr: string, tz?: string): string {
    const timezone = tz || getUserTimezone();
    const localDatetime = `${dateStr}T${timeStr}:00`;
    const utcDate = fromZonedTime(localDatetime, timezone);
    return utcDate.toISOString();
}

/** Convert a UTC ISO string into MySQL DATETIME (UTC) */
export function localToMysql(dateStr: string, timeStr: string): string {
    return `${dateStr} ${timeStr}:00`;
}

/**
 * Common IANA timezone list for the picker.
 * Covers most major cities/regions worldwide.
 */
export const TIMEZONES = [
    { value: 'UTC',                    label: 'UTC (Coordinated Universal Time)' },
    { value: 'Pacific/Midway',         label: 'UTC-11 — Midway Island' },
    { value: 'Pacific/Honolulu',       label: 'UTC-10 — Honolulu' },
    { value: 'America/Anchorage',      label: 'UTC-9 — Anchorage' },
    { value: 'America/Los_Angeles',    label: 'UTC-8 — Los Angeles, Seattle' },
    { value: 'America/Denver',         label: 'UTC-7 — Denver, Phoenix' },
    { value: 'America/Chicago',        label: 'UTC-6 — Chicago, Mexico City' },
    { value: 'America/New_York',       label: 'UTC-5 — New York, Toronto' },
    { value: 'America/Caracas',        label: 'UTC-4:30 — Caracas' },
    { value: 'America/Halifax',        label: 'UTC-4 — Halifax, Santiago' },
    { value: 'America/Sao_Paulo',      label: 'UTC-3 — São Paulo, Buenos Aires' },
    { value: 'Atlantic/Azores',        label: 'UTC-1 — Azores' },
    { value: 'Europe/London',          label: 'UTC+0 — London, Dublin' },
    { value: 'Europe/Paris',           label: 'UTC+1 — Paris, Berlin, Rome' },
    { value: 'Europe/Helsinki',        label: 'UTC+2 — Helsinki, Cairo' },
    { value: 'Europe/Moscow',          label: 'UTC+3 — Moscow, Nairobi' },
    { value: 'Asia/Tehran',            label: 'UTC+3:30 — Tehran' },
    { value: 'Asia/Dubai',             label: 'UTC+4 — Dubai, Abu Dhabi' },
    { value: 'Asia/Kabul',             label: 'UTC+4:30 — Kabul' },
    { value: 'Asia/Karachi',           label: 'UTC+5 — Karachi, Islamabad' },
    { value: 'Asia/Kolkata',           label: 'UTC+5:30 — Mumbai, New Delhi' },
    { value: 'Asia/Kathmandu',         label: 'UTC+5:45 — Kathmandu' },
    { value: 'Asia/Dhaka',             label: 'UTC+6 — Dhaka, Almaty' },
    { value: 'Asia/Yangon',            label: 'UTC+6:30 — Yangon' },
    { value: 'Asia/Bangkok',           label: 'UTC+7 — Bangkok, Jakarta, Hanoi' },
    { value: 'Asia/Singapore',         label: 'UTC+8 — Singapore, Manila, KL' },
    { value: 'Asia/Hong_Kong',         label: 'UTC+8 — Hong Kong' },
    { value: 'Asia/Shanghai',          label: 'UTC+8 — Beijing, Shanghai' },
    { value: 'Asia/Tokyo',             label: 'UTC+9 — Tokyo, Seoul' },
    { value: 'Australia/Adelaide',     label: 'UTC+9:30 — Adelaide' },
    { value: 'Australia/Sydney',       label: 'UTC+10 — Sydney, Melbourne' },
    { value: 'Pacific/Noumea',         label: 'UTC+11 — Noumea' },
    { value: 'Pacific/Auckland',       label: 'UTC+12 — Auckland, Fiji' },
];
