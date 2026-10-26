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

  const sheet = workbook.addWorksheet("Serve Matrix", {
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
  title.value = "Serve Matrix";
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

  addSummarySheet(workbook, report);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function addSummarySheet(workbook: ExcelJS.Workbook, report: ServeReport) {
  const sheet = workbook.addWorksheet("Summary", {
    properties: { tabColor: { argb: "FF111111" } },
    pageSetup: {
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  sheet.columns = [
    { width: 22 },
    { width: 24 },
    { width: 46 },
    { width: 28 },
  ];

  const included = report.plans.filter((plan) => plan.included);
  const excluded = report.plans.filter((plan) => !plan.included);

  const title = sheet.getCell(1, 1);
  title.value = "Serve Matrix";
  title.font = { name: "Calibri", size: 20, bold: true, color: { argb: "FF111111" } };
  sheet.mergeCells(1, 1, 1, 4);

  const period = sheet.getCell(2, 1);
  period.value = report.monthLabel;
  period.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FF3F6212" } };
  sheet.mergeCells(2, 1, 2, 4);

  const generated = sheet.getCell(3, 1);
  generated.value = `Generated ${report.generatedAt}`;
  generated.font = { name: "Calibri", size: 11, color: { argb: "FF525252" } };
  sheet.mergeCells(3, 1, 3, 4);

  const stats = [
    ["People", report.people.length],
    ["Services counted", included.length],
    ["Scheduled times", report.grandTotal],
  ] as const;
  stats.forEach(([label, value], index) => {
    const header = sheet.getCell(5, index + 1);
    header.value = label;
    styleHeader(header, "FF111111", "FFFFFFFF");
    const cell = sheet.getCell(6, index + 1);
    cell.value = value;
    cell.font = { name: "Calibri", size: 14, bold: true };
    cell.alignment = { horizontal: "center" };
  });

  let row = 8;
  const notesHeader = sheet.getCell(row, 1);
  notesHeader.value = "Notes";
  notesHeader.font = { name: "Calibri", size: 14, bold: true };
  row += 1;
  for (const note of report.notes) {
    const cell = sheet.getCell(row, 1);
    cell.value = note;
    cell.font = { name: "Calibri", size: 11, color: { argb: "FF404040" } };
    cell.alignment = { wrapText: true, vertical: "top" };
    sheet.mergeCells(row, 1, row, 4);
    sheet.getRow(row).height = 32;
    row += 1;
  }

  row += 1;
  row = writePlanTable(sheet, row, `${included.length} services counted`, included, false);
  if (excluded.length > 0) {
    row += 1;
    writePlanTable(sheet, row, `${excluded.length} left out`, excluded, true);
  }
}

function writePlanTable(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  heading: string,
  plans: ServeReport["plans"],
  showReason: boolean,
) {
  const title = sheet.getCell(startRow, 1);
  title.value = heading;
  title.font = { name: "Calibri", size: 14, bold: true };
  sheet.mergeCells(startRow, 1, startRow, 4);

  const headers = showReason ? ["Date", "Service", "Plan", "Reason"] : ["Date", "Service", "Plan"];
  headers.forEach((header, index) => {
    const cell = sheet.getCell(startRow + 1, index + 1);
    cell.value = header;
    styleHeader(cell, "FF111111", "FFFFFFFF");
  });

  plans.forEach((plan, index) => {
    const excelRow = sheet.getRow(startRow + 2 + index);
    const values = [
      plan.dateLabel,
      plan.serviceName,
      plan.title || plan.serviceName,
      ...(showReason ? [plan.excludeReason || "Left out"] : []),
    ];
    values.forEach((value, column) => {
      const cell = excelRow.getCell(column + 1);
      cell.value = value;
      cell.font = { name: "Calibri", size: 11 };
      cell.alignment = { vertical: "middle", wrapText: true };
      if (index % 2 === 1) cell.fill = solid("FFF7F7F5");
    });
  });

  return startRow + 2 + plans.length;
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
