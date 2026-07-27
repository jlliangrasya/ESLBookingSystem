// Shared color/icon config for teacher calendar notes (TeacherDashboard + AdminCalendarPage).
// Colors are stored as raw hex codes (e.g. "#FFBF00") so teachers aren't limited to a fixed palette.

export interface NoteColorPreset {
  hex: string;
  label: string;
}

// Quick-pick swatches — teachers can still type/pick any other hex via the color input.
export const NOTE_COLOR_PRESETS: NoteColorPreset[] = [
  { hex: "#FDE68A", label: "Amber" },
  { hex: "#FECACA", label: "Red" },
  { hex: "#BFDBFE", label: "Blue" },
  { hex: "#BBF7D0", label: "Green" },
  { hex: "#E9D5FF", label: "Purple" },
  { hex: "#FBCFE8", label: "Pink" },
  { hex: "#E5E7EB", label: "Gray" },
  { hex: "#99F6E4", label: "Teal" },
];

export const DEFAULT_NOTE_COLOR = NOTE_COLOR_PRESETS[0].hex;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
export const isValidHex = (v: string | undefined | null): v is string => !!v && HEX_RE.test(v);

/** Picks readable text color (dark or white) for a given background hex, by perceived luminance. */
export const getContrastText = (hex: string | undefined | null): string => {
  const h = isValidHex(hex) ? hex : DEFAULT_NOTE_COLOR;
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1f2937" : "#ffffff";
};

export const NOTE_ICONS: string[] = ["🍽️", "☕", "📞", "🏠", "🚗", "🩺", "📚", "🛌", "⚠️", "✈️"];
