// Renders a class report to a PNG and triggers a download.
// Drawn directly on a canvas (rather than screenshotting the DOM) so long
// textarea content is never clipped and no extra dependency is needed.

export interface ReportImageData {
  studentName: string;
  teacherName?: string | null;
  classDate?: string | null; // already formatted for display
  newWords?: string | null;
  sentences?: string | null;
  notes?: string | null;
  remarks?: string | null;
}

const WIDTH = 1400;
const PAD = 36;
const GAP = 24; // space between the two columns
const SCALE = 2;
const BRAND = "#65C3E8";
const FONT = "Poppins, 'Segoe UI', Arial, sans-serif";

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    if (!para.trim()) { out.push(""); continue; }
    let line = "";
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth) { line = test; continue; }
      if (line) out.push(line);
      // Break words longer than the box width
      line = word;
      while (ctx.measureText(line).width > maxWidth) {
        let i = line.length - 1;
        while (i > 1 && ctx.measureText(line.slice(0, i)).width > maxWidth) i--;
        out.push(line.slice(0, i));
        line = line.slice(i);
      }
    }
    out.push(line);
  }
  return out;
}

export async function downloadReportImage(data: ReportImageData) {
  if (document.fonts?.ready) await document.fonts.ready;

  // Left column: what was taught; right column: teacher's feedback
  const columns = [
    [
      { label: "New Words", value: data.newWords },
      { label: "Sentences", value: data.sentences },
    ],
    [
      { label: "Notes", value: data.notes },
      { label: "Remarks", value: data.remarks },
    ],
  ];

  const bodyFont = `24px ${FONT}`;
  const labelFont = `600 26px ${FONT}`;
  const lineH = 36;
  const labelH = 38;
  const boxPad = 16;
  const sectionGap = 18;
  const colW = (WIDTH - PAD * 2 - GAP) / 2;
  const innerW = colW - boxPad * 2;

  // Measure pass
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = bodyFont;
  // Collapse runs of blank lines so stray empty lines don't pad the boxes
  const clean = (v?: string | null) => (v ?? "").replace(/\r/g, "").replace(/\n\s*\n+/g, "\n").trim() || "—";
  const wrapped = columns.map((col) => col.map((s) => wrapLines(measure, clean(s.value), innerW)));

  // Box heights per column; the shorter column's boxes are stretched so both
  // columns end on the same line instead of leaving a blank area underneath
  const boxHeights = wrapped.map((col) => col.map((lines) => lines.length * lineH + boxPad * 2));
  const colHeights = boxHeights.map((col) =>
    col.reduce((h, boxH) => h + labelH + boxH, 0) + sectionGap * (col.length - 1)
  );
  const bodyH = Math.max(...colHeights);
  boxHeights.forEach((col, c) => {
    const extra = (bodyH - colHeights[c]) / col.length;
    col.forEach((_, i) => { col[i] += extra; });
  });

  const headerH = 140;
  const footerH = 36; // bottom margin, also holds the small credit
  const height = headerH + PAD + bodyH + footerH;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "top";

  // Background + header band
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.fillStyle = BRAND;
  ctx.fillRect(0, 0, WIDTH, headerH);

  ctx.fillStyle = "#ffffff";
  ctx.font = `600 44px ${FONT}`;
  ctx.fillText("Class Report", PAD, 26);
  ctx.font = `500 28px ${FONT}`;
  ctx.fillText(data.studentName, PAD, 86);

  ctx.textAlign = "right";
  ctx.font = `22px ${FONT}`;
  if (data.classDate) ctx.fillText(data.classDate, WIDTH - PAD, 36);
  if (data.teacherName) ctx.fillText(`Teacher: ${data.teacherName}`, WIDTH - PAD, 90);
  ctx.textAlign = "left";

  // Sections, one column at a time
  columns.forEach((col, c) => {
    const x = PAD + c * (colW + GAP);
    let y = headerH + PAD;
    col.forEach((s, i) => {
      const lines = wrapped[c][i];
      ctx.fillStyle = "#334155";
      ctx.font = labelFont;
      ctx.fillText(s.label, x, y);
      y += labelH;

      const boxH = boxHeights[c][i];
      ctx.fillStyle = "#f1f5f9";
      ctx.beginPath();
      ctx.roundRect(x, y, colW, boxH, 10);
      ctx.fill();

      ctx.fillStyle = "#0f172a";
      ctx.font = bodyFont;
      lines.forEach((line, j) => ctx.fillText(line, x + boxPad, y + boxPad + j * lineH + 4));
      y += boxH + sectionGap;
    });
  });

  // Small credit in the bottom-right corner
  ctx.fillStyle = "#94a3b8";
  ctx.font = `14px ${FONT}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText("© Brightfolks", WIDTH - PAD, height - 12);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("Could not create image");

  const safe = (v: string) => v.replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "");
  const name = ["class-report", safe(data.studentName), data.classDate ? safe(data.classDate) : ""]
    .filter(Boolean)
    .join("_");

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
