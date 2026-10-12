import { jsPDF } from "jspdf";
import { autoTable, type CellHookData } from "jspdf-autotable";

export interface PayrollClassRow {
  label: string;
  count: number;
  rate: number;
}

export interface PayrollAdjustment {
  label: string;
  amount: number;
}

export interface PayrollSummary {
  teacherName: string;
  teacherEmail: string;
  periodLabel: string;
  classRows: PayrollClassRow[];
  adjustments: PayrollAdjustment[];
}

// jsPDF's built-in fonts have no ₱ glyph, so the PDF spells the currency out.
const php = (n: number) =>
  `${n < 0 ? "-" : ""}PHP ${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const BRAND: [number, number, number] = [46, 107, 158]; // #2E6B9E, the app's primary

// Right-align every numeric column in head, body and foot alike
const alignNumbers = (data: CellHookData) => {
  if (data.column.index > 0) data.cell.styles.halign = "right";
};

export const downloadPayrollPdf = (s: PayrollSummary, fileName: string) => {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Payroll Summary", margin, 56);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated ${new Date().toLocaleString("en-US")}`, pageWidth - margin, 56, { align: "right" });

  doc.setTextColor(0);
  doc.setFontSize(11);
  doc.text(`Teacher: ${s.teacherName}`, margin, 84);
  doc.text(`Email: ${s.teacherEmail}`, margin, 100);
  doc.text(`Period: ${s.periodLabel}`, margin, 116);

  const classSubtotal = s.classRows.reduce((sum, r) => sum + r.count * r.rate, 0);
  const adjustmentSubtotal = s.adjustments.reduce((sum, a) => sum + a.amount, 0);

  autoTable(doc, {
    startY: 136,
    margin: { left: margin, right: margin },
    head: [["Classes", "Qty", "Rate", "Amount"]],
    body: s.classRows.map(r => [r.label, String(r.count), php(r.rate), php(r.count * r.rate)]),
    foot: [["Classes subtotal", "", "", php(classSubtotal)]],
    headStyles: { fillColor: BRAND },
    footStyles: { fillColor: [243, 244, 246], textColor: 0 },
    didParseCell: alignNumbers,
  });

  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;

  if (s.adjustments.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Additions / Deductions", "Amount"]],
      body: s.adjustments.map(a => [a.label, php(a.amount)]),
      foot: [["Adjustments subtotal", php(adjustmentSubtotal)]],
      headStyles: { fillColor: BRAND },
      footStyles: { fillColor: [243, 244, 246], textColor: 0 },
      didParseCell: alignNumbers,
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;
  }

  doc.setDrawColor(...BRAND);
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Total Salary", margin, y + 22);
  doc.setTextColor(...BRAND);
  doc.text(php(classSubtotal + adjustmentSubtotal), pageWidth - margin, y + 22, { align: "right" });

  doc.save(fileName);
};
