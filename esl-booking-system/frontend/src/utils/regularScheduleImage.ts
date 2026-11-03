// Renders a teacher's regular weekly timetable (students' agreed slots plus the
// teacher's regular open/closed slots) to a PNG and triggers a download.
// Drawn on a canvas like reportImage.ts, so no extra dependency is needed.

export type RegularImageCell =
  | { kind: "student"; label: string; color: string } // agreed student slot
  | { kind: "clash"; label: string } // two+ students in one slot
  | { kind: "open" } // teacher regularly open, no student = vacancy
  | { kind: "closed" };

export interface RegularScheduleImageData {
  teacherName: string;
  days: string[]; // "Monday".."Sunday"
  times: string[]; // row start times, "HH:MM"
  cell: (day: string, time: string) => RegularImageCell;
}

const SCALE = 2;
const PAD = 32;
const TIME_COL = 90;
const DAY_COL = 150;
const ROW_H = 26;
const HEAD_H = 34;
const BRAND = "#65C3E8";
const FONT = "Poppins, 'Segoe UI', Arial, sans-serif";

const fmt12 = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

export async function downloadRegularScheduleImage(data: RegularScheduleImageData) {
  if (document.fonts?.ready) await document.fonts.ready;

  // Drop the empty (all closed) rows at the top and bottom so the image only
  // covers the hours that matter.
  const used = data.times.map((t) => data.days.some((d) => data.cell(d, t).kind !== "closed"));
  const first = used.indexOf(true);
  const last = used.lastIndexOf(true);
  const times = first === -1 ? data.times : data.times.slice(first, last + 1);

  const width = PAD * 2 + TIME_COL + DAY_COL * data.days.length;
  const titleH = 70;
  const legendH = 44;
  const height = PAD + titleH + HEAD_H + ROW_H * times.length + legendH + PAD;

  const canvas = document.createElement("canvas");
  canvas.width = width * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = BRAND;
  ctx.fillRect(0, 0, width, 6);

  // Title
  ctx.fillStyle = "#1f2937";
  ctx.font = `600 22px ${FONT}`;
  ctx.fillText(`Regular Schedule — ${data.teacherName}`, PAD, PAD + 16);
  ctx.fillStyle = "#6b7280";
  ctx.font = `400 13px ${FONT}`;
  ctx.fillText("Weekly timetable · students' agreed slots and the teacher's regular open hours", PAD, PAD + 44);

  const gridTop = PAD + titleH;
  const gridLeft = PAD;

  // Header row
  ctx.fillStyle = "#f3f4f6";
  ctx.fillRect(gridLeft, gridTop, width - PAD * 2, HEAD_H);
  ctx.fillStyle = "#374151";
  ctx.font = `600 13px ${FONT}`;
  ctx.fillText("Time", gridLeft + 10, gridTop + HEAD_H / 2);
  ctx.textAlign = "center";
  data.days.forEach((d, i) => {
    ctx.fillText(d, gridLeft + TIME_COL + DAY_COL * i + DAY_COL / 2, gridTop + HEAD_H / 2);
  });
  ctx.textAlign = "left";

  // Body
  times.forEach((time, r) => {
    const y = gridTop + HEAD_H + r * ROW_H;
    ctx.fillStyle = "#6b7280";
    ctx.font = `500 12px ${FONT}`;
    ctx.fillText(fmt12(time), gridLeft + 10, y + ROW_H / 2);

    data.days.forEach((day, i) => {
      const x = gridLeft + TIME_COL + DAY_COL * i;
      const c = data.cell(day, time);
      let bg = "#f3f4f6";
      let fg = "#9ca3af";
      let text = "";
      if (c.kind === "student") { bg = c.color; fg = "#ffffff"; text = c.label; }
      else if (c.kind === "clash") { bg = "#fef3c7"; fg = "#92400e"; text = `⚠ ${c.label}`; }
      else if (c.kind === "open") { bg = "#dcfce7"; fg = "#15803d"; text = "Open"; }
      ctx.fillStyle = bg;
      ctx.fillRect(x, y, DAY_COL, ROW_H);
      if (text) {
        ctx.fillStyle = fg;
        ctx.font = `${c.kind === "open" ? 400 : 600} 12px ${FONT}`;
        ctx.textAlign = "center";
        ctx.fillText(fitText(ctx, text, DAY_COL - 10), x + DAY_COL / 2, y + ROW_H / 2);
        ctx.textAlign = "left";
      }
    });
  });

  // Grid lines
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  const gridBottom = gridTop + HEAD_H + ROW_H * times.length;
  for (let r = 0; r <= times.length; r++) {
    const y = gridTop + HEAD_H + r * ROW_H;
    ctx.beginPath(); ctx.moveTo(gridLeft, y); ctx.lineTo(width - PAD, y); ctx.stroke();
  }
  for (let i = 0; i <= data.days.length; i++) {
    const x = gridLeft + TIME_COL + DAY_COL * i;
    ctx.beginPath(); ctx.moveTo(x, gridTop); ctx.lineTo(x, gridBottom); ctx.stroke();
  }
  ctx.strokeRect(gridLeft, gridTop, width - PAD * 2, gridBottom - gridTop);

  // Legend
  const legend: [string, string][] = [["#dcfce7", "Open — vacant"], ["#f3f4f6", "Closed"], [BRAND, "Student's regular class"], ["#fef3c7", "⚠ Two students in one slot"]];
  let lx = PAD;
  const ly = gridBottom + 24;
  ctx.font = `400 12px ${FONT}`;
  for (const [color, label] of legend) {
    ctx.fillStyle = color;
    ctx.fillRect(lx, ly - 7, 14, 14);
    ctx.strokeStyle = "#d1d5db";
    ctx.strokeRect(lx, ly - 7, 14, 14);
    ctx.fillStyle = "#4b5563";
    ctx.fillText(label, lx + 20, ly);
    lx += 20 + ctx.measureText(label).width + 24;
  }
  ctx.textAlign = "right";
  ctx.fillStyle = "#9ca3af";
  ctx.fillText("© Brightfolks", width - PAD, ly);
  ctx.textAlign = "left";

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("Could not create image");

  const safe = (v: string) => v.replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `regular-schedule_${safe(data.teacherName)}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
