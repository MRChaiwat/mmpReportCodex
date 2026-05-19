import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import express from "express";
import multer from "multer";
import ExcelJS from "exceljs";

const app = express();
const port = process.env.PORT || 4173;
const root = process.cwd();
const dataDir = path.join(root, "server", "data");
const uploadDir = path.join(dataDir, "uploads");
const dashboardPath = path.join(dataDir, "dashboard.json");

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 120 * 1024 * 1024 }
});

const users = [
  { id: "u_admin", username: "admin", password: "admin123", name: "Admin", role: "admin" },
  { id: "u_manager", username: "manager", password: "manager123", name: "Manager", role: "manager" },
  { id: "u_sales", username: "sales", password: "sales123", name: "Sales Demo", role: "sales", salesName: "VS-03-Songsit" }
];

const sessions = new Map();

app.use(express.json({ limit: "2mb" }));

function cookieValue(req, name) {
  const raw = req.headers.cookie || "";
  return raw
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");
}

function safeUser(user) {
  const { password, ...rest } = user;
  return rest;
}

function requireAuth(req, res, next) {
  const token = cookieValue(req, "mmp_session");
  const session = token ? sessions.get(token) : null;
  if (!session) return res.status(401).json({ error: "Not authenticated" });
  req.user = session.user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Admin role required" });
  next();
}

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(/,/g, "").trim();
    const parsed = Number(normalized);
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
  const found = monthOrder.find((m) => m.toLowerCase() === text);
  return found || "Unknown";
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

function toSortedArray(map, nameKey, limit = 20) {
  return Array.from(map.entries())
    .map(([name, values]) => ({ [nameKey]: name, ...roundValues(values) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "th"));
}

async function parseWorkbook(filePath, originalName) {
  const totalsByType = new Map();
  const areaMap = new Map();
  const monthMap = new Map();
  const salesMap = new Map();
  const productMap = new Map();
  const customerMap = new Map();
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

      if (amountRaw === null || amountRaw === "") quality.missingAmount += 1;
      if (field(row, "Salename") === null || field(row, "Salename") === "") quality.missingSales += 1;
      if (field(row, "YYMM") === null || field(row, "YYMM") === "") quality.missingYymm += 1;
      if (kgRaw === null || kgRaw === "") quality.missingKg += 1;
      if (field(row, "Product ID") === null || field(row, "Product ID") === "") quality.missingProductId += 1;
      if (area === "Area 6" && type === "Budget 26") quality.area6Budget26Rows += 1;
      if (month === "Unknown") quality.unknownMonthRows += 1;

      addAgg(totalsByType, type, amount, qty, kg);
      addAgg(areaMap, `${area}|${type}`, amount, qty, kg);
      addAgg(monthMap, `${month}|${type}`, amount, qty, kg);
      addAgg(salesMap, `${sales}|${type}`, amount, qty, kg);
      addAgg(productMap, `${productGroup}|${type}`, amount, qty, kg);
      addAgg(customerMap, `${customer}|${type}`, amount, qty, kg);
      addAgg(cubeMap, `${area}|${sales}|${productGroup}|${month}|${type}`, amount, qty, kg);
    }

    break;
  }

  const monthOrder = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Unknown"];
  const typeOrder = ["Actual 25/24", "Budget 25", "Budget 26"];
  const cube = Array.from(cubeMap.entries()).map(([key, values]) => {
    const [area, sales, productGroup, month, type] = key.split("|");
    return { area, sales, productGroup, month, type, ...roundValues(values) };
  });

  return {
    meta: {
      sourceFile: originalName,
      sheetName,
      importedAt: new Date().toISOString(),
      rowCount
    },
    filters: {
      areas: uniqueSorted(cube.map((r) => r.area)),
      sales: uniqueSorted(cube.map((r) => r.sales)),
      productGroups: uniqueSorted(cube.map((r) => r.productGroup)),
      months: monthOrder
    },
    typeOrder,
    totalsByType: Object.fromEntries(Array.from(totalsByType.entries()).map(([type, values]) => [type, roundValues(values)])),
    cube,
    rankings: {
      sales: toSortedArray(salesMap, "name", 30),
      productGroups: toSortedArray(productMap, "name", 30),
      customers: toSortedArray(customerMap, "name", 30),
      areas: toSortedArray(areaMap, "name", 30)
    },
    quality
  };
}

async function readDashboard() {
  try {
    const raw = await fs.readFile(dashboardPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function summarizeCube(cube) {
  const totalsByType = new Map();
  const salesMap = new Map();
  const productMap = new Map();
  const areaMap = new Map();

  for (const row of cube) {
    addAgg(totalsByType, row.type, row.amount, row.qty, row.kg);
    addAgg(salesMap, row.sales, row.amount, row.qty, row.kg);
    addAgg(productMap, row.productGroup, row.amount, row.qty, row.kg);
    addAgg(areaMap, row.area, row.amount, row.qty, row.kg);
  }

  return {
    filters: {
      areas: uniqueSorted(cube.map((r) => r.area)),
      sales: uniqueSorted(cube.map((r) => r.sales)),
      productGroups: uniqueSorted(cube.map((r) => r.productGroup)),
      months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Unknown"]
    },
    totalsByType: Object.fromEntries(Array.from(totalsByType.entries()).map(([type, values]) => [type, roundValues(values)])),
    rankings: {
      sales: toSortedArray(salesMap, "name", 30),
      productGroups: toSortedArray(productMap, "name", 30),
      customers: [],
      areas: toSortedArray(areaMap, "name", 30)
    }
  };
}

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  const user = users.find((item) => item.username === username && item.password === password);
  if (!user) return res.status(401).json({ error: "Invalid username or password" });
  const token = crypto.randomUUID();
  sessions.set(token, { user: safeUser(user), createdAt: Date.now() });
  res.setHeader("Set-Cookie", `mmp_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`);
  res.json({ user: safeUser(user) });
});

app.post("/api/logout", requireAuth, (req, res) => {
  const token = cookieValue(req, "mmp_session");
  if (token) sessions.delete(token);
  res.setHeader("Set-Cookie", "mmp_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
  res.json({ ok: true });
});

app.get("/api/me", requireAuth, (req, res) => res.json({ user: req.user }));

app.get("/api/dashboard", requireAuth, async (req, res) => {
  const dashboard = await readDashboard();
  if (!dashboard) return res.json({ empty: true });
  if (req.user.role === "sales") {
    const cube = dashboard.cube.filter((row) => row.sales === req.user.salesName);
    return res.json({ ...dashboard, cube, ...summarizeCube(cube) });
  }
  res.json(dashboard);
});

app.post("/api/upload", requireAuth, requireAdmin, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Please choose an Excel file" });
  await fs.mkdir(dataDir, { recursive: true });
  const dashboard = await parseWorkbook(req.file.path, req.file.originalname);
  await fs.writeFile(dashboardPath, JSON.stringify(dashboard), "utf8");
  await fs.unlink(req.file.path).catch(() => {});
  res.json({ ok: true, meta: dashboard.meta });
});

app.use(express.static(path.join(root, "dist")));
app.get("*", async (_req, res, next) => {
  try {
    await fs.access(path.join(root, "dist", "index.html"));
    res.sendFile(path.join(root, "dist", "index.html"));
  } catch {
    next();
  }
});

await fs.mkdir(uploadDir, { recursive: true });
app.listen(port, () => console.log(`API server running on http://localhost:${port}`));
