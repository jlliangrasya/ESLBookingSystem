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

const WIDTH = 1000;
const PAD = 48;
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

  const sections = [
    { label: "New Words", value: data.newWords },
    { label: "Sentences", value: data.sentences },
    { label: "Notes", value: data.notes },
    { label: "Remarks", value: data.remarks },
  ];

  const bodyFont = `15px ${FONT}`;
  const lineH = 24;
  const boxPad = 16;
  const innerW = WIDTH - PAD * 2 - boxPad * 2;

  // Measure pass
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = bodyFont;
  const wrapped = sections.map((s) => wrapLines(measure, s.value?.trim() || "—", innerW));

  const headerH = 130;
  let height = headerH + PAD;
  for (const lines of wrapped) height += 28 + lines.length * lineH + boxPad * 2 + 24;
  height += 40; // footer

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
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText("Class Report", PAD, 32);
  ctx.font = `500 18px ${FONT}`;
  ctx.fillText(data.studentName, PAD, 76);

  ctx.textAlign = "right";
  ctx.font = `15px ${FONT}`;
  if (data.classDate) ctx.fillText(data.classDate, WIDTH - PAD, 40);
  if (data.teacherName) ctx.fillText(`Teacher: ${data.teacherName}`, WIDTH - PAD, 78);
  ctx.textAlign = "left";

  // Sections
  let y = headerH + PAD;
  sections.forEach((s, i) => {
    const lines = wrapped[i];
    ctx.fillStyle = "#334155";
    ctx.font = `600 16px ${FONT}`;
    ctx.fillText(s.label, PAD, y);
    y += 28;

    const boxH = lines.length * lineH + boxPad * 2;
    ctx.fillStyle = "#f1f5f9";
    ctx.beginPath();
    ctx.roundRect(PAD, y, WIDTH - PAD * 2, boxH, 8);
    ctx.fill();

    ctx.fillStyle = "#0f172a";
    ctx.font = bodyFont;
    lines.forEach((line, j) => ctx.fillText(line, PAD + boxPad, y + boxPad + j * lineH + 3));
    y += boxH + 24;
  });

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
