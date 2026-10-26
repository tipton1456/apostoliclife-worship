import PDFDocument from "pdfkit";
import { teamGroups } from "@/lib/serve-report/matrix";
import type { ServeReport, ServeTeamName } from "@/lib/serve-report/types";

const PAGE_WIDTH = 792;
const PAGE_HEIGHT = 612;
const MARGIN = 24;

const TEAM_FILL: Record<ServeTeamName, string> = {
  Band: "#14532D",
  "Worship Team": "#7BBC07",
  Tech: "#155E75",
};

const TEAM_TEXT: Record<ServeTeamName, string> = {
  Band: "#FFFFFF",
  "Worship Team": "#102000",
  Tech: "#FFFFFF",
};

export function serveReportToPdf(report: ServeReport, logo: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      layout: "landscape",
      margin: 0,
      info: {
        Title: `Apostolic Worship Serve Matrix ${report.monthLabel}`,
        Author: "Apostolic Worship",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    drawReport(doc, report, logo);
    doc.end();
  });
}

function drawReport(doc: PDFKit.PDFDocument, report: ServeReport, logo: Buffer) {
  const columnCount = Math.max(report.columns.length, 1);
  const nameWidth = 118;
  const totalWidth = 34;
  const usable = PAGE_WIDTH - MARGIN * 2 - nameWidth - totalWidth;
  const columnWidth = usable / columnCount;
  const headerHeight = 102;
  let pageNumber = 1;
  let y = drawBanner(doc, report, logo, true);

  const drawTableHeader = () => {
    y = drawColumnHeader(doc, report, y, nameWidth, columnWidth, totalWidth, headerHeight);
  };

  drawTableHeader();

  report.people.forEach((person, index) => {
    if (y + 14 > PAGE_HEIGHT - 20) {
      drawFooter(doc, report, pageNumber);
      doc.addPage({ size: "LETTER", layout: "landscape", margin: 0 });
      pageNumber += 1;
      y = drawBanner(doc, report, logo, false);
      drawTableHeader();
    }

    drawPersonRow(
      doc,
      person.name,
      person.counts,
      person.total,
      y,
      nameWidth,
      columnWidth,
      totalWidth,
      14,
      index % 2 === 1,
    );
    y += 14;
  });

  if (y + 16 > PAGE_HEIGHT - 20) {
    drawFooter(doc, report, pageNumber);
    doc.addPage({ size: "LETTER", layout: "landscape", margin: 0 });
    pageNumber += 1;
    y = drawBanner(doc, report, logo, false);
    drawTableHeader();
  }

  drawTotalRow(doc, report, y, nameWidth, columnWidth, totalWidth);
  drawFooter(doc, report, pageNumber);
  drawSummary(doc, report, logo, pageNumber);
}

function drawSummary(
  doc: PDFKit.PDFDocument,
  report: ServeReport,
  logo: Buffer,
  pageNumber: number,
) {
  const included = report.plans.filter((plan) => plan.included);
  const excluded = report.plans.filter((plan) => !plan.included);
  const width = PAGE_WIDTH - MARGIN * 2;
  let y = 0;

  const nextPage = (full: boolean) => {
    if (pageNumber > 0 && y !== 0) drawFooter(doc, report, pageNumber);
    doc.addPage({ size: "LETTER", layout: "landscape", margin: 0 });
    pageNumber += 1;
    y = drawBanner(doc, report, logo, full, "Summary");
  };

  const ensure = (height: number) => {
    if (y + height > PAGE_HEIGHT - 28) nextPage(false);
  };

  const write = (text: string, font: string, size: number, color: string, gap = 3) => {
    doc.font(font).fontSize(size);
    const height = doc.heightOfString(text, { width });
    ensure(height + gap);
    doc.fillColor(color).text(text, MARGIN, y, { width });
    y += height + gap;
  };

  nextPage(true);
  write(
    `${report.monthLabel}: ${report.people.length} people, ${included.length} services, ${report.grandTotal} scheduled times.`,
    "Helvetica",
    10,
    "#222222",
    4,
  );
  write(
    `${report.confirmed} confirmed and ${report.unconfirmed} still unconfirmed.`,
    "Helvetica",
    10,
    "#222222",
    10,
  );

  write("Notes", "Helvetica-Bold", 12, "#111111", 4);
  for (const note of report.notes) {
    write(note, "Helvetica", 9, "#404040", 4);
  }

  y += 6;
  write(`${included.length} services counted`, "Helvetica-Bold", 12, "#111111", 4);
  for (const plan of included) {
    const title = plan.title ? ` · ${plan.title}` : "";
    write(`${plan.dateLabel} · ${plan.serviceName}${title}`, "Helvetica", 9, "#222222", 2);
  }

  if (excluded.length > 0) {
    y += 8;
    write(`${excluded.length} left out`, "Helvetica-Bold", 12, "#111111", 4);
    for (const plan of excluded) {
      const title = plan.title ? ` · ${plan.title}` : "";
      write(
        `${plan.dateLabel} · ${plan.serviceName}${title} · ${plan.excludeReason || "Left out"}`,
        "Helvetica",
        9,
        "#404040",
        2,
      );
    }
  }

  drawFooter(doc, report, pageNumber);
}

function drawBanner(
  doc: PDFKit.PDFDocument,
  report: ServeReport,
  logo: Buffer,
  full: boolean,
  title = "Serve Matrix",
) {
  const height = full ? 78 : 42;
  doc.rect(0, 0, PAGE_WIDTH, height).fill("#000000");
  doc.rect(0, height, PAGE_WIDTH, 3).fill("#7BBC07");

  if (logo.length > 0) {
    doc.image(logo, 16, full ? 10 : 4, { fit: [full ? 58 : 32, full ? 58 : 32] });
  }

  const textX = logo.length > 0 ? (full ? 84 : 56) : 20;
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(full ? 18 : 12);
  doc.text(title, textX, full ? 18 : 8, { lineBreak: false });
  doc.fillColor("#7BBC07").font("Helvetica-Bold").fontSize(full ? 12 : 9);
  doc.text(report.monthLabel, textX, full ? 40 : 24, { lineBreak: false });
  if (full) {
    doc.fillColor("#D4D4D4").font("Helvetica").fontSize(9);
    doc.text("Band, Worship Team, and Tech", textX, 56, { lineBreak: false });
  }

  return height + 14;
}

function drawColumnHeader(
  doc: PDFKit.PDFDocument,
  report: ServeReport,
  y: number,
  nameWidth: number,
  columnWidth: number,
  totalWidth: number,
  headerHeight: number,
) {
  let x = MARGIN;
  doc.rect(x, y, nameWidth, headerHeight).fill("#111111");
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(8);
  doc.text("Name", x + 6, y + headerHeight - 16, { lineBreak: false });
  x += nameWidth;

  let groupX = x;
  for (const group of teamGroups(report.columns)) {
    const width = group.count * columnWidth;
    doc.rect(groupX, y, width, 14).fill(TEAM_FILL[group.team]);
    doc.fillColor(TEAM_TEXT[group.team]).font("Helvetica-Bold").fontSize(7);
    doc.text(group.team, groupX + 2, y + 3, {
      width: width - 4,
      height: 10,
      ellipsis: true,
      lineBreak: false,
    });
    groupX += width;
  }

  report.columns.forEach((column, index) => {
    const cellX = x + index * columnWidth;
    doc.rect(cellX, y + 14, columnWidth, headerHeight - 14).fill(TEAM_FILL[column.team]);
    doc.save();
    doc.rect(cellX + 0.5, y + 15, columnWidth - 1, headerHeight - 17).clip();
    doc.fillColor(TEAM_TEXT[column.team]).font("Helvetica").fontSize(6);
    doc.translate(cellX + 8, y + headerHeight - 4);
    doc.rotate(-90);
    doc.text(column.position, 0, 0, {
      width: headerHeight - 22,
      lineBreak: false,
      ellipsis: true,
    });
    doc.restore();
  });

  const totalX = x + report.columns.length * columnWidth;
  doc.rect(totalX, y, totalWidth, headerHeight).fill("#111111");
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(7);
  doc.text("Total", totalX + 2, y + headerHeight - 16, {
    width: totalWidth - 4,
    align: "center",
    lineBreak: false,
  });

  return y + headerHeight;
}

function drawPersonRow(
  doc: PDFKit.PDFDocument,
  name: string,
  counts: number[],
  total: number,
  y: number,
  nameWidth: number,
  columnWidth: number,
  totalWidth: number,
  rowHeight: number,
  shaded: boolean,
) {
  const rowFill = shaded ? "#F7F7F5" : "#FFFFFF";
  let x = MARGIN;
  doc.rect(x, y, nameWidth, rowHeight).fill(rowFill);
  doc.fillColor("#111111").font("Helvetica").fontSize(7.5);
  doc.text(name, x + 4, y + 3, {
    width: nameWidth - 8,
    height: 10,
    ellipsis: true,
    lineBreak: false,
  });
  x += nameWidth;

  counts.forEach((count, index) => {
    const cellX = x + index * columnWidth;
    doc.rect(cellX, y, columnWidth, rowHeight).fill(rowFill);
    if (count > 0) {
      doc.fillColor("#111111").font("Helvetica").fontSize(8);
      doc.text(String(count), cellX, y + 3, {
        width: columnWidth,
        align: "center",
        lineBreak: false,
      });
    }
    doc.moveTo(cellX, y).lineTo(cellX, y + rowHeight).strokeColor("#E5E5E5").lineWidth(0.3).stroke();
  });

  const totalX = x + counts.length * columnWidth;
  doc.rect(totalX, y, totalWidth, rowHeight).fill("#F3F4F6");
  doc.fillColor("#111111").font("Helvetica-Bold").fontSize(8);
  doc.text(String(total), totalX, y + 3, {
    width: totalWidth,
    align: "center",
    lineBreak: false,
  });
}

function drawTotalRow(
  doc: PDFKit.PDFDocument,
  report: ServeReport,
  y: number,
  nameWidth: number,
  columnWidth: number,
  totalWidth: number,
) {
  let x = MARGIN;
  doc.rect(x, y, nameWidth, 16).fill("#111111");
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(8);
  doc.text("Total", x + 6, y + 4, { lineBreak: false });
  x += nameWidth;

  report.columnTotals.forEach((total, index) => {
    const cellX = x + index * columnWidth;
    doc.rect(cellX, y, columnWidth, 16).fill("#111111");
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(7);
    doc.text(String(total), cellX, y + 4, {
      width: columnWidth,
      align: "center",
      lineBreak: false,
    });
  });

  const totalX = x + report.columnTotals.length * columnWidth;
  doc.rect(totalX, y, totalWidth, 16).fill("#7BBC07");
  doc.fillColor("#102000").font("Helvetica-Bold").fontSize(8);
  doc.text(String(report.grandTotal), totalX, y + 4, {
    width: totalWidth,
    align: "center",
    lineBreak: false,
  });
}

function drawFooter(doc: PDFKit.PDFDocument, report: ServeReport, pageNumber: number) {
  doc.font("Helvetica").fontSize(8).fillColor("#737373");
  doc.text(
    `Apostolic Worship · ${report.monthLabel} · ${report.generatedAt} · Page ${pageNumber}`,
    MARGIN,
    PAGE_HEIGHT - 18,
    { width: PAGE_WIDTH - MARGIN * 2, align: "right", lineBreak: false },
  );
}
