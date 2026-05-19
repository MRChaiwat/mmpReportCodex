import ExcelJS from "exceljs";

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function asText(value, fallback = "Unspecified") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value).trim() || fallback;
}

function field(row, name) {
  if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
  const normalized = String(name).trim();
  const key = Object.keys(row).find((item) => item.trim() === normalized);
  return key ? row[key] : undefined;
}

function cellValue(value) {
  if (value && typeof value === "object") {
    if (value.text) return value.text;
    if (value.result !== undefined) return value.result;
    if (value.richText) return value.richText.map((part) => part.text).join("");
  }
  return value;
}

function monthName(value) {
  const monthOrder = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const text = asText(value, "").slice(0, 3).toLowerCase();
  return monthOrder.find((month) => month.toLowerCase() === text) || "Unknown";
}

function addAgg(map, key, amount, qty, kg) {
  const current = map.get(key) || { amount: 0, qty: 0, kg: 0, rows: 0 };
  current.amount += amount;
  current.qty += qty;
  current.kg += kg;
  current.rows += 1;
  map.set(key, current);
}

function roundValues(values) {
  return {
    amount: Math.round(values.amount * 100) / 100,
    qty: Math.round(values.qty * 100) / 100,
    kg: Math.round(values.kg * 100) / 100,
    rows: values.rows
  };
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "th"));
}

function toSortedArray(map, nameKey, limit = 30) {
  return Array.from(map.entries())
    .map(([name, values]) => ({ [nameKey]: name, ...roundValues(values) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

export function summarizeCube(cube) {
  const totalsByType = new Map();
  const salesMap = new Map();
  const productMap = new Map();
  const areaMap = new Map();
  const customerMap = new Map();

  for (const row of cube) {
    addAgg(totalsByType, row.type, row.amount, row.qty, row.kg);
    addAgg(salesMap, row.sales, row.amount, row.qty, row.kg);
    addAgg(productMap, row.productGroup, row.amount, row.qty, row.kg);
    addAgg(areaMap, row.area, row.amount, row.qty, row.kg);
    addAgg(customerMap, row.customer, row.amount, row.qty, row.kg);
  }

  return {
    filters: {
      areas: uniqueSorted(cube.map((row) => row.area)),
      sales: uniqueSorted(cube.map((row) => row.sales)),
      productGroups: uniqueSorted(cube.map((row) => row.productGroup)),
      months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Unknown"]
    },
    totalsByType: Object.fromEntries(Array.from(totalsByType.entries()).map(([type, values]) => [type, roundValues(values)])),
    rankings: {
      sales: toSortedArray(salesMap, "name"),
      productGroups: toSortedArray(productMap, "name"),
      customers: toSortedArray(customerMap, "name"),
      areas: toSortedArray(areaMap, "name")
    }
  };
}

export async function parseWorkbook(filePath, originalName) {
  const cubeMap = new Map();
  const quality = {
    missingAmount: 0,
    missingSales: 0,
    missingYymm: 0,
    missingKg: 0,
    missingProductId: 0,
    area6Budget26Rows: 0,
    unknownMonthRows: 0
  };

  let sheetName = "Data";
  let rowCount = 0;
  const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    worksheets: "emit",
    sharedStrings: "cache",
    styles: "ignore",
    hyperlinks: "ignore"
  });

  for await (const worksheetReader of workbookReader) {
    sheetName = worksheetReader.name;
    let headers = [];

    for await (const excelRow of worksheetReader) {
      if (excelRow.number === 1) {
        headers = excelRow.values.map((value) => asText(cellValue(value), ""));
        continue;
      }

      const row = {};
      excelRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const header = headers[colNumber];
        if (header) row[header] = cellValue(cell.value);
      });
      if (Object.keys(row).length === 0) continue;

      rowCount += 1;
      const type = asText(field(row, "Type"), "Unknown");
      const area = asText(field(row, "Area"));
      const sales = asText(field(row, "Salename"));
      const productGroup = asText(field(row, "Product Group"));
      const customer = asText(field(row, "Customer Name"));
      const month = monthName(field(row, "Month"));
      const amountRaw = field(row, "Amount");
      const qtyRaw = field(row, "QTY");
      const kgRaw = field(row, "Kg");
      const amount = asNumber(amountRaw);
      const qty = asNumber(qtyRaw);
      const kg = asNumber(kgRaw);

      if (amountRaw === null || amountRaw === undefined || amountRaw === "") quality.missingAmount += 1;
      if (field(row, "Salename") === null || field(row, "Salename") === undefined || field(row, "Salename") === "") quality.missingSales += 1;
      if (field(row, "YYMM") === null || field(row, "YYMM") === undefined || field(row, "YYMM") === "") quality.missingYymm += 1;
      if (kgRaw === null || kgRaw === undefined || kgRaw === "") quality.missingKg += 1;
      if (field(row, "Product ID") === null || field(row, "Product ID") === undefined || field(row, "Product ID") === "") quality.missingProductId += 1;
      if (area === "Area 6" && type === "Budget 26") quality.area6Budget26Rows += 1;
      if (month === "Unknown") quality.unknownMonthRows += 1;

      addAgg(cubeMap, `${area}|${sales}|${productGroup}|${customer}|${month}|${type}`, amount, qty, kg);
    }
    break;
  }

  const cube = Array.from(cubeMap.entries()).map(([key, values]) => {
    const [area, sales, productGroup, customer, month, type] = key.split("|");
    return { area, sales, productGroup, customer, month, type, ...roundValues(values) };
  });

  return {
    meta: { sourceFile: originalName, sheetName, importedAt: new Date().toISOString(), rowCount },
    cube,
    summary: summarizeCube(cube),
    quality
  };
}
