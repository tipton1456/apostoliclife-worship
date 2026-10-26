import ExcelJS from "exceljs";
import { teamGroups } from "@/lib/serve-report/matrix";
import type { ServeReport, ServeTeamName } from "@/lib/serve-report/types";

const TEAM_FILL: Record<ServeTeamName, string> = {
  Band: "FF14532D",
  "Worship Team": "FF7BBC07",
  Tech: "FF155E75",
};

const TEAM_FONT: Record<ServeTeamName, string> = {
  Band: "FFFFFFFF",
  "Worship Team": "FF102000",
  Tech: "FFFFFFFF",
};

export async function serveReportToXlsx(report: ServeReport, logo: Buffer) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Apostolic Worship";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Serve Report", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 8, showGridLines: false }],
    properties: { tabColor: { argb: "FF7BBC07" } },
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  const lastCol = Math.max(report.columns.length + 2, 8);
  sheet.getColumn(1).width = 26;
  for (let column = 2; column <= lastCol; column += 1) {
    sheet.getColumn(column).width = column === report.columns.length + 2 ? 10 : 14;
  }

  for (let row = 1; row <= 5; row += 1) {
    const excelRow = sheet.getRow(row);
    excelRow.height = 18;
    for (let column = 1; column <= lastCol; column += 1) {
      excelRow.getCell(column).fill = solid("FF000000");
    }
  }

  if (logo.length > 0) {
    const imageId = workbook.addImage({
      buffer: logoAsExcelBuffer(logo),
      extension: "png",
    });
    sheet.addImage(imageId, {
      tl: { col: 0.15, row: 0.15 },
      ext: { width: 78, height: 78 },
    });
  }

  const title = sheet.getCell(2, 3);
  title.value = "Monthly Serve Report";
  title.font = { name: "Calibri", size: 22, bold: true, color: { argb: "FFFFFFFF" } };
  title.alignment = { vertical: "middle" };

  const month = sheet.getCell(3, 3);
  month.value = report.monthLabel;
  month.font = { name: "Calibri", size: 16, bold: true, color: { argb: "FF7BBC07" } };

  const subtitle = sheet.getCell(4, 3);
  subtitle.value = "Band, Worship Team, and Tech";
  subtitle.font = { name: "Calibri", size: 12, color: { argb: "FFD4D4D4" } };

  if (lastCol > 3) {
    sheet.mergeCells(2, 3, 2, lastCol);
    sheet.mergeCells(3, 3, 3, lastCol);
    sheet.mergeCells(4, 3, 4, lastCol);
  }

  const groupRow = sheet.getRow(7);
  const positionRow = sheet.getRow(8);
  groupRow.height = 22;
  positionRow.height = 136;

  const nameHeader = groupRow.getCell(1);
  nameHeader.value = "Name";
  styleHeader(nameHeader, "FF111111", "FFFFFFFF");
  sheet.mergeCells(7, 1, 8, 1);

  let columnIndex = 2;
  for (const group of teamGroups(report.columns)) {
    const start = columnIndex;
    const header = groupRow.getCell(start);
    header.value = group.team;
    styleHeader(header, TEAM_FILL[group.team], TEAM_FONT[group.team]);
    if (group.count > 1) {
      sheet.mergeCells(7, start, 7, start + group.count - 1);
    }
    columnIndex += group.count;
  }

  report.columns.forEach((column, index) => {
    const cell = positionRow.getCell(index + 2);
    cell.value = column.position;
    styleHeader(cell, TEAM_FILL[column.team], TEAM_FONT[column.team]);
    cell.alignment = {
      vertical: "bottom",
      horizontal: "center",
      wrapText: true,
      textRotation: 90,
    };
  });

  const totalColumn = report.columns.length + 2;
  const totalHeader = groupRow.getCell(totalColumn);
  totalHeader.value = "Total";
  styleHeader(totalHeader, "FF111111", "FFFFFFFF");
  sheet.mergeCells(7, totalColumn, 8, totalColumn);

  report.people.forEach((person, personIndex) => {
    const row = sheet.getRow(9 + personIndex);
    row.height = 18;
    const nameCell = row.getCell(1);
    nameCell.value = person.name;
    nameCell.font = { name: "Calibri", size: 11 };
    nameCell.alignment = { vertical: "middle" };
    if (personIndex % 2 === 1) nameCell.fill = solid("FFF7F7F5");

    person.counts.forEach((count, countIndex) => {
      const cell = row.getCell(countIndex + 2);
      cell.value = count > 0 ? count : null;
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.font = { name: "Calibri", size: 11 };
      if (personIndex % 2 === 1) cell.fill = solid("FFF7F7F5");
    });

    const totalCell = row.getCell(report.columns.length + 2);
    totalCell.value = person.total;
    totalCell.font = { name: "Calibri", size: 11, bold: true };
    totalCell.alignment = { horizontal: "center", vertical: "middle" };
    totalCell.fill = solid("FFF3F4F6");
  });

  const totalRowNumber = 9 + report.people.length;
  const totalRow = sheet.getRow(totalRowNumber);
  totalRow.height = 20;
  const totalLabel = totalRow.getCell(1);
  totalLabel.value = "Total";
  styleHeader(totalLabel, "FF111111", "FFFFFFFF");

  report.columnTotals.forEach((total, index) => {
    const cell = totalRow.getCell(index + 2);
    cell.value = total;
    styleHeader(cell, "FF111111", "FFFFFFFF");
  });

  const grand = totalRow.getCell(report.columns.length + 2);
  grand.value = report.grandTotal;
  styleHeader(grand, "FF7BBC07", "FF102000");

  if (report.people.length > 0) {
    sheet.autoFilter = {
      from: { row: 8, column: 1 },
      to: { row: 8 + report.people.length, column: report.columns.length + 2 },
    };
  }

  const noteRow = totalRowNumber + 2;
  report.notes.forEach((note, index) => {
    const cell = sheet.getCell(noteRow + index, 1);
    cell.value = note;
    cell.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF525252" } };
    sheet.mergeCells(noteRow + index, 1, noteRow + index, Math.min(lastCol, 8));
  });

  const services = workbook.addWorksheet("Services", {
    properties: { tabColor: { argb: "FF155E75" } },
  });
  services.columns = [
    { header: "Date", key: "date", width: 16 },
    { header: "Service", key: "service", width: 22 },
    { header: "Plan", key: "plan", width: 42 },
    { header: "Counted", key: "counted", width: 18 },
  ];
  services.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  services.getRow(1).fill = solid("FF111111");

  for (const plan of report.plans) {
    services.addRow({
      date: plan.dateLabel,
      service: plan.serviceName,
      plan: plan.title || plan.serviceName,
      counted: plan.included ? "Yes" : plan.excludeReason || "Left out",
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function styleHeader(cell: ExcelJS.Cell, fill: string, font: string) {
  cell.fill = solid(fill);
  cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: font } };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
}

function solid(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function logoAsExcelBuffer(logo: Buffer) {
  return logo as unknown as ExcelJS.Buffer;
}
