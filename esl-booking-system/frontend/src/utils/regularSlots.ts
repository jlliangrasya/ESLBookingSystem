// A teacher's regular weekly OPEN 30-minute slot. Slots not listed are
// regularly closed. A record only — it never opens or closes real slots.
export interface TeacherRegularSlot {
  day_of_week: string; // "Monday".."Sunday"
  slot_time: string; // "HH:MM", on :00 or :30
}

export const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

const fmt12 = (mins: number) => {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

// One line per day with its open ranges merged, e.g.
// "Mon  9:00 AM–12:00 PM, 1:00 PM–5:00 PM". Days with nothing open are left out.
export function summarizeRegularSlots(slots: TeacherRegularSlot[]): { day: string; ranges: string }[] {
  const out: { day: string; ranges: string }[] = [];
  for (const day of DAYS_OF_WEEK) {
    const mins = slots
      .filter((s) => s.day_of_week === day)
      .map((s) => toMinutes(s.slot_time))
      .sort((a, b) => a - b);
    if (mins.length === 0) continue;
    const ranges: string[] = [];
    let start = mins[0];
    let prev = mins[0];
    for (const m of [...mins.slice(1), Infinity]) {
      if (m === prev + 30) { prev = m; continue; }
      ranges.push(`${fmt12(start)}–${fmt12(prev + 30)}`);
      start = m;
      prev = m;
    }
    out.push({ day: day.slice(0, 3), ranges: ranges.join(", ") });
  }
  return out;
}
