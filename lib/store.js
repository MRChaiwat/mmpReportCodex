import fs from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { neon } from "@neondatabase/serverless";
import { id, sha256 } from "./crypto.js";
import { summarizeCube } from "./excel.js";

const localPath = path.join(process.cwd(), "server", "data", "local-store.json");
let sqlClient = null;

function hasDatabase() {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

function sql() {
  if (!sqlClient) {
    const connection = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!connection) throw new Error("DATABASE_URL is required in production");
    sqlClient = neon(connection);
  }
  return sqlClient;
}

async function readLocal() {
  try {
    return JSON.parse(await fs.readFile(localPath, "utf8"));
  } catch {
    const passwordHash = await bcrypt.hash("admin123", 12);
    return {
      users: [{
        id: "usr_local_admin",
        email: "_admin",
        name: "Admin",
        role: "admin",
        status: "approved",
        passwordHash,
        createdAt: new Date().toISOString(),
        approvedAt: new Date().toISOString()
      }],
      sessions: [],
      roleScopes: [],
      imports: [],
      facts: [],
      qualityIssues: []
    };
  }
}

async function writeLocal(data) {
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, JSON.stringify(data), "utf8");
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, password_hash, ...safe } = user;
  return {
    ...safe,
    passwordHash: undefined,
    password_hash: undefined,
    createdAt: user.createdAt || user.created_at,
    approvedAt: user.approvedAt || user.approved_at,
    rejectedAt: user.rejectedAt || user.rejected_at
  };
}

function normalizeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    passwordHash: row.password_hash || row.passwordHash,
    createdAt: row.created_at || row.createdAt,
    approvedAt: row.approved_at || row.approvedAt,
    rejectedAt: row.rejected_at || row.rejectedAt
  };
}

export async function createUser({ email, name, password, requestedRole = "sales", requestedScopeType = null, requestedScopeValue = null }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail || !password || !name) throw new Error("Name, email, and password are required");
  const passwordHash = await bcrypt.hash(password, 12);

  if (hasDatabase()) {
    const rows = await sql()`
      insert into users (id, email, name, password_hash, role, status)
      values (${id("usr")}, ${normalizedEmail}, ${name}, ${passwordHash}, ${requestedRole}, 'pending')
      returning id, email, name, role, status, created_at
    `;
    if (requestedScopeType && requestedScopeValue) {
      await sql()`insert into role_scopes (id, user_id, scope_type, scope_value) values (${id("scp")}, ${rows[0].id}, ${requestedScopeType}, ${requestedScopeValue})`;
    }
    return publicUser(normalizeUser(rows[0]));
  }

  const data = await readLocal();
  if (data.users.some((user) => user.email === normalizedEmail)) throw new Error("Email already exists");
  const user = { id: id("usr"), email: normalizedEmail, name, passwordHash, role: requestedRole, status: "pending", createdAt: new Date().toISOString() };
  data.users.push(user);
  if (requestedScopeType && requestedScopeValue) data.roleScopes.push({ id: id("scp"), userId: user.id, scopeType: requestedScopeType, scopeValue: requestedScopeValue });
  await writeLocal(data);
  return publicUser(user);
}

export async function verifyLogin(email, password) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  let user;
  if (hasDatabase()) {
    const rows = await sql()`select * from users where email = ${normalizedEmail} limit 1`;
    user = normalizeUser(rows[0]);
  } else {
    const data = await readLocal();
    user = data.users.find((item) => item.email === normalizedEmail);
  }
  if (!user || !(await bcrypt.compare(password || "", user.passwordHash))) return { error: "Invalid email or password" };
  if (user.status !== "approved") return { error: "Account is waiting for _admin approval" };
  return { user: publicUser(user) };
}

export async function createSession(userId, tokenHash, expiresAt) {
  if (hasDatabase()) {
    await sql()`insert into sessions (id, user_id, token_hash, expires_at) values (${id("ses")}, ${userId}, ${tokenHash}, ${expiresAt.toISOString()})`;
    return;
  }
  const data = await readLocal();
  data.sessions.push({ id: id("ses"), userId, tokenHash, expiresAt: expiresAt.toISOString() });
  await writeLocal(data);
}

export async function deleteSession(token) {
  const tokenHash = sha256(token || "");
  if (hasDatabase()) {
    await sql()`delete from sessions where token_hash = ${tokenHash}`;
    return;
  }
  const data = await readLocal();
  data.sessions = data.sessions.filter((session) => session.tokenHash !== tokenHash);
  await writeLocal(data);
}

export async function getUserBySession(token) {
  if (!token) return null;
  const tokenHash = sha256(token);
  const now = new Date().toISOString();

  if (hasDatabase()) {
    const rows = await sql()`
      select u.*
      from sessions s
      join users u on u.id = s.user_id
      where s.token_hash = ${tokenHash}
        and s.expires_at > ${now}
        and u.status = 'approved'
      limit 1
    `;
    return publicUser(normalizeUser(rows[0]));
  }

  const data = await readLocal();
  const session = data.sessions.find((item) => item.tokenHash === tokenHash && item.expiresAt > now);
  const user = session ? data.users.find((item) => item.id === session.userId && item.status === "approved") : null;
  return publicUser(user);
}

export async function listUsers() {
  if (hasDatabase()) {
    const rows = await sql()`select id, email, name, role, status, created_at, approved_at, rejected_at from users order by created_at desc`;
    return rows.map((row) => publicUser(normalizeUser(row)));
  }
  const data = await readLocal();
  return data.users.map(publicUser).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function updateUserStatus({ userId, status, role, scopes = [] }) {
  const now = new Date().toISOString();
  if (hasDatabase()) {
    const rows = await sql()`
      update users
      set status = ${status},
          role = ${role},
          approved_at = case when ${status} = 'approved' then ${now}::timestamptz else approved_at end,
          rejected_at = case when ${status} = 'rejected' then ${now}::timestamptz else rejected_at end
      where id = ${userId}
      returning id, email, name, role, status, created_at, approved_at, rejected_at
    `;
    await sql()`delete from role_scopes where user_id = ${userId}`;
    for (const scope of scopes.filter((item) => item.scopeType && item.scopeValue)) {
      await sql()`insert into role_scopes (id, user_id, scope_type, scope_value) values (${id("scp")}, ${userId}, ${scope.scopeType}, ${scope.scopeValue})`;
    }
    return publicUser(normalizeUser(rows[0]));
  }

  const data = await readLocal();
  const user = data.users.find((item) => item.id === userId);
  if (!user) throw new Error("User not found");
  user.status = status;
  user.role = role;
  if (status === "approved") user.approvedAt = now;
  if (status === "rejected") user.rejectedAt = now;
  data.roleScopes = data.roleScopes.filter((item) => item.userId !== userId);
  for (const scope of scopes.filter((item) => item.scopeType && item.scopeValue)) {
    data.roleScopes.push({ id: id("scp"), userId, scopeType: scope.scopeType, scopeValue: scope.scopeValue });
  }
  await writeLocal(data);
  return publicUser(user);
}

export async function saveImport({ uploadedBy, fileName, blobUrl, parsed }) {
  const importId = id("imp");
  const issues = Object.entries(parsed.quality).map(([issueType, count]) => ({
    id: id("iss"),
    importId,
    issueType,
    severity: issueType.includes("missing") || issueType.includes("unknown") ? "warning" : "info",
    count
  }));

  if (hasDatabase()) {
    await sql()`
      insert into imports (id, uploaded_by, file_name, blob_url, sheet_name, row_count, status, imported_at, dashboard_json)
      values (${importId}, ${uploadedBy}, ${fileName}, ${blobUrl}, ${parsed.meta.sheetName}, ${parsed.meta.rowCount}, 'processing', ${parsed.meta.importedAt}, ${JSON.stringify(parsed)}::jsonb)
    `;
    for (const issue of issues) {
      await sql()`
        insert into data_quality_issues (id, import_id, issue_type, severity, issue_count)
        values (${issue.id}, ${importId}, ${issue.issueType}, ${issue.severity}, ${issue.count})
      `;
    }
    await sql()`update imports set status = 'completed' where id = ${importId}`;
    return importId;
  }

  const data = await readLocal();
  data.imports.push({ id: importId, uploadedBy, fileName, blobUrl, sheetName: parsed.meta.sheetName, rowCount: parsed.meta.rowCount, status: "completed", importedAt: parsed.meta.importedAt });
  data.facts = data.facts.filter((row) => row.importId !== importId).concat(parsed.cube.map((row) => ({ ...row, importId })));
  data.qualityIssues = data.qualityIssues.filter((row) => row.importId !== importId).concat(issues);
  await writeLocal(data);
  return importId;
}

export async function getLatestDashboard(user) {
  let latest;
  let facts;
  let issues;
  let scopes;

  if (hasDatabase()) {
    const imports = await sql()`select * from imports where status = 'completed' order by imported_at desc limit 1`;
    latest = imports[0];
    if (!latest) return { empty: true };
    if (latest.dashboard_json) {
      facts = latest.dashboard_json.cube.map((row) => ({ ...row, importId: latest.id }));
    } else {
      facts = await sql()`select * from budget_facts where import_id = ${latest.id}`;
    }
    issues = await sql()`select issue_type, severity, issue_count from data_quality_issues where import_id = ${latest.id}`;
    scopes = await sql()`select scope_type, scope_value from role_scopes where user_id = ${user.id}`;
  } else {
    const data = await readLocal();
    latest = data.imports.filter((item) => item.status === "completed").sort((a, b) => String(b.importedAt).localeCompare(String(a.importedAt)))[0];
    if (!latest) return { empty: true };
    facts = data.facts.filter((row) => row.importId === latest.id);
    issues = data.qualityIssues.filter((row) => row.importId === latest.id).map((row) => ({ issue_type: row.issueType, severity: row.severity, issue_count: row.count }));
    scopes = data.roleScopes.filter((row) => row.userId === user.id).map((row) => ({ scope_type: row.scopeType, scope_value: row.scopeValue }));
  }

  let cube = facts.map((row) => ({
    area: row.area,
    sales: row.salename || row.sales,
    productGroup: row.product_group || row.productGroup,
    customer: row.customer_name || row.customer,
    month: row.month,
    type: row.type,
    amount: Number(row.amount),
    qty: Number(row.qty),
    kg: Number(row.kg),
    rows: Number(row.row_count || row.rows)
  }));

  if (user.role !== "admin" && user.role !== "executive" && user.role !== "finance") {
    cube = filterCubeByScopes(cube, user, scopes);
  }

  const quality = Object.fromEntries(issues.map((issue) => [issue.issue_type || issue.issueType, Number(issue.issue_count || issue.count)]));
  return {
    meta: {
      id: latest.id,
      sourceFile: latest.file_name || latest.fileName,
      blobUrl: latest.blob_url || latest.blobUrl,
      sheetName: latest.sheet_name || latest.sheetName,
      rowCount: latest.row_count || latest.rowCount,
      importedAt: latest.imported_at || latest.importedAt
    },
    typeOrder: ["Actual 25/24", "Budget 25", "Budget 26"],
    cube,
    ...summarizeDashboardCube(cube),
    quality
  };
}

function filterCubeByScopes(cube, user, scopes) {
  if (!scopes.length && user.role === "sales") return cube.filter((row) => row.sales === user.name || row.sales === user.email);
  if (!scopes.length) return [];
  return cube.filter((row) => scopes.some((scope) => {
    const type = scope.scope_type || scope.scopeType;
    const value = scope.scope_value || scope.scopeValue;
    if (type === "area") return row.area === value;
    if (type === "sales") return row.sales === value;
    if (type === "product_group") return row.productGroup === value;
    return false;
  }));
}

function summarizeDashboardCube(cube) {
  return summarizeCube(cube);
}
