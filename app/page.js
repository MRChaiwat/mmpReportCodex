"use client";

import { useEffect, useMemo, useState } from "react";

const typeOrder = ["Actual 25/24", "Budget 25", "Budget 26"];
const monthOrder = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: options.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function money(value) {
  const number = Number(value || 0);
  if (Math.abs(number) >= 1_000_000_000) return `${(number / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  return number.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

function pct(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "-";
}

export default function Page() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    api("/api/auth/me")
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setBooting(false));
  }, []);

  if (booting) return <div className="centerState">Loading</div>;
  if (!user) return <AuthScreen onLogin={setUser} />;
  return <DashboardApp user={user} onLogout={() => setUser(null)} />;
}

function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [message, setMessage] = useState("");

  return (
    <main className="authPage">
      <section className="authPanel">
        <div className="authIntro">
          <p className="label">MMP Budget Dashboard</p>
          <h1>Secure budget reporting for approved users</h1>
          <p>
            Users can request access, but every account stays pending until _admin approves role and scope.
          </p>
        </div>
        <div className="authBox">
          <div className="tabs">
            <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Login</button>
            <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Register</button>
          </div>
          {mode === "login" ? <LoginForm onLogin={onLogin} /> : <RegisterForm onDone={setMessage} />}
          {message ? <p className="notice">{message}</p> : null}
        </div>
      </section>
    </main>
  );
}

function LoginForm({ onLogin }) {
  const [email, setEmail] = useState("_admin");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>Email or _admin<input value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      {error ? <p className="error">{error}</p> : null}
      <button disabled={loading}>{loading ? "Checking..." : "Login"}</button>
      <small>Local dev starts with _admin / admin123. Production should run the seed script with a strong password.</small>
    </form>
  );
}

function RegisterForm({ onDone }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", requestedRole: "sales", requestedScopeType: "sales", requestedScopeValue: "" });
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const data = await api("/api/auth/register", { method: "POST", body: JSON.stringify(form) });
      onDone(data.message);
      setForm({ name: "", email: "", password: "", requestedRole: "sales", requestedScopeType: "sales", requestedScopeValue: "" });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
      <label>Email<input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
      <label>Password<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
      <label>Requested role
        <select value={form.requestedRole} onChange={(event) => setForm({ ...form, requestedRole: event.target.value })}>
          <option value="sales">sales</option>
          <option value="manager">manager</option>
          <option value="product_manager">product_manager</option>
          <option value="finance">finance</option>
          <option value="executive">executive</option>
        </select>
      </label>
      <label>Scope type
        <select value={form.requestedScopeType} onChange={(event) => setForm({ ...form, requestedScopeType: event.target.value })}>
          <option value="sales">sales</option>
          <option value="area">area</option>
          <option value="product_group">product_group</option>
        </select>
      </label>
      <label>Scope value, optional<input placeholder="VS-03-Songsit, Area 1, Product Group" value={form.requestedScopeValue} onChange={(event) => setForm({ ...form, requestedScopeValue: event.target.value })} /></label>
      {error ? <p className="error">{error}</p> : null}
      <button>Submit for _admin approval</button>
    </form>
  );
}

function DashboardApp({ user, onLogout }) {
  const [dashboard, setDashboard] = useState(null);
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState({ area: "All", sales: "All", productGroup: "All" });
  const [status, setStatus] = useState("Loading dashboard");

  async function loadAll() {
    setStatus("Loading dashboard");
    const dash = await api("/api/dashboard");
    setDashboard(dash);
    if (user.role === "admin") {
      const userData = await api("/api/admin/users");
      setUsers(userData.users);
    }
    setStatus("");
  }

  useEffect(() => {
    loadAll().catch((error) => setStatus(error.message));
  }, []);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    onLogout();
  }

  return (
    <main className="appShell">
      <aside className="sideNav">
        <div>
          <p className="label">MMP</p>
          <h2>Budget Control</h2>
        </div>
        <nav>
          <a className="active">Dashboard</a>
          {user.role === "admin" ? <a>Approvals</a> : null}
          {user.role === "admin" ? <a>Imports</a> : null}
        </nav>
        <div className="identity">
          <strong>{user.name}</strong>
          <span>{user.role}</span>
          <button onClick={logout}>Logout</button>
        </div>
      </aside>
      <section className="content">
        <header className="pageHeader">
          <div>
            <h1>Budget Performance</h1>
            <p>{dashboard?.meta ? `Latest import: ${dashboard.meta.sourceFile} · ${new Date(dashboard.meta.importedAt).toLocaleString("th-TH")}` : "No completed import yet"}</p>
          </div>
          {user.role === "admin" ? <Uploader onUploaded={loadAll} /> : null}
        </header>
        {status ? <div className="stateBox">{status}</div> : null}
        {dashboard?.empty ? <div className="stateBox">No completed import yet. _admin can upload the first Excel file.</div> : null}
        {dashboard && !dashboard.empty ? <Dashboard dashboard={dashboard} filters={filters} setFilters={setFilters} /> : null}
        {user.role === "admin" ? <AdminUsers users={users} onChanged={loadAll} /> : null}
      </section>
    </main>
  );
}

function Uploader({ onUploaded }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMessage("Importing Excel...");
    try {
      const mode = await api("/api/upload-mode");
      let result;
      if (mode.directBlobUpload && file.size > mode.maxServerUploadBytes) {
        setMessage("Uploading directly to Blob...");
        const { upload } = await import("@vercel/blob/client");
        const blob = await upload(`budget-imports/${Date.now()}-${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/blob-upload",
          multipart: true
        });
        setMessage("Parsing uploaded file...");
        result = await api("/api/import-blob", { method: "POST", body: JSON.stringify({ url: blob.url, fileName: file.name }) });
      } else {
        const body = new FormData();
        body.append("file", file);
        result = await api("/api/upload", { method: "POST", body });
      }
      setMessage(`Imported ${result.meta.rowCount.toLocaleString("th-TH")} rows`);
      await onUploaded();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  return <label className="uploadButton"><input type="file" accept=".xlsx" disabled={busy} onChange={upload} />{busy ? "Importing" : "Upload Excel"}<span>{message}</span></label>;
}

function Dashboard({ dashboard, filters, setFilters }) {
  const rows = useMemo(() => dashboard.cube.filter((row) => {
    if (filters.area !== "All" && row.area !== filters.area) return false;
    if (filters.sales !== "All" && row.sales !== filters.sales) return false;
    if (filters.productGroup !== "All" && row.productGroup !== filters.productGroup) return false;
    return true;
  }), [dashboard, filters]);

  const totals = useMemo(() => group(rows, "type"), [rows]);
  const monthly = useMemo(() => monthOrder.map((month) => ({ month, ...Object.fromEntries(typeOrder.map((type) => [type, rows.filter((row) => row.month === month && row.type === type).reduce((sum, row) => sum + row.amount, 0)])) })), [rows]);
  const budget26 = totals["Budget 26"]?.amount || 0;
  const budget25 = totals["Budget 25"]?.amount || 0;
  const actual = totals["Actual 25/24"]?.amount || 0;

  return (
    <>
      <section className="filters">
        <Select label="Area" value={filters.area} options={["All", ...dashboard.filters.areas]} onChange={(area) => setFilters({ ...filters, area })} />
        <Select label="Sales" value={filters.sales} options={["All", ...dashboard.filters.sales]} onChange={(sales) => setFilters({ ...filters, sales })} />
        <Select label="Product Group" value={filters.productGroup} options={["All", ...dashboard.filters.productGroups]} onChange={(productGroup) => setFilters({ ...filters, productGroup })} />
      </section>
      <section className="kpiGrid">
        <Kpi label="Budget 26" value={money(budget26)} note={`${rows.length.toLocaleString("th-TH")} aggregates`} />
        <Kpi label="Budget 25" value={money(budget25)} note={`B26 vs B25 ${pct(budget25 ? (budget26 - budget25) / budget25 : NaN)}`} />
        <Kpi label="Actual 25/24" value={money(actual)} note={`B26 vs Actual ${pct(actual ? (budget26 - actual) / actual : NaN)}`} />
        <Kpi label="Variance" value={money(budget26 - budget25)} note="Budget 26 minus Budget 25" />
      </section>
      <section className="grid">
        <Panel title="Monthly Trend" wide><LineChart data={monthly} /></Panel>
        <Panel title="Sales Performance"><Table rows={top(rows, "sales")} label="Sales" /></Panel>
        <Panel title="Area Performance"><Table rows={top(rows, "area")} label="Area" /></Panel>
        <Panel title="Product Group Mix" wide><Bars rows={top(rows, "productGroup")} /></Panel>
        <Panel title="Data Quality"><Quality quality={dashboard.quality} /></Panel>
      </section>
    </>
  );
}

function AdminUsers({ users, onChanged }) {
  const [drafts, setDrafts] = useState({});
  const draftFor = (user) => drafts[user.id] || { role: user.role || "sales", scopeType: "sales", scopeValue: "" };

  async function update(user, status) {
    const draft = draftFor(user);
    await api("/api/admin/users", {
      method: "PATCH",
      body: JSON.stringify({
        userId: user.id,
        status,
        role: draft.role,
        scopes: draft.scopeValue ? [{ scopeType: draft.scopeType, scopeValue: draft.scopeValue }] : []
      })
    });
    await onChanged();
  }

  return (
    <section className="adminPanel">
      <h2>User approvals</h2>
      <div className="tableWrap">
        <table>
          <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td><strong>{user.name}</strong><br /><span>{user.email}</span></td>
                <td>
                  <select value={draftFor(user).role} onChange={(event) => setDrafts({ ...drafts, [user.id]: { ...draftFor(user), role: event.target.value } })}>
                    <option value="sales">sales</option>
                    <option value="manager">manager</option>
                    <option value="product_manager">product_manager</option>
                    <option value="finance">finance</option>
                    <option value="executive">executive</option>
                    <option value="admin">admin</option>
                  </select>
                  <div className="scopeEditor">
                    <select value={draftFor(user).scopeType} onChange={(event) => setDrafts({ ...drafts, [user.id]: { ...draftFor(user), scopeType: event.target.value } })}>
                      <option value="sales">sales</option>
                      <option value="area">area</option>
                      <option value="product_group">product_group</option>
                    </select>
                    <input placeholder="Scope value" value={draftFor(user).scopeValue} onChange={(event) => setDrafts({ ...drafts, [user.id]: { ...draftFor(user), scopeValue: event.target.value } })} />
                  </div>
                </td>
                <td>{user.status}</td>
                <td>{user.status === "pending" ? <><button onClick={() => update(user, "approved")}>Approve</button><button className="secondary" onClick={() => update(user, "rejected")}>Reject</button></> : "Reviewed"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Select({ label, value, options, onChange }) {
  return <label><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function Kpi({ label, value, note }) {
  return <article className="kpi"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function Panel({ title, children, wide }) {
  return <section className={`panel ${wide ? "wide" : ""}`}><h2>{title}</h2>{children}</section>;
}

function group(rows, key) {
  return rows.reduce((acc, row) => {
    acc[row[key]] ||= { amount: 0, qty: 0, kg: 0, rows: 0 };
    acc[row[key]].amount += row.amount;
    acc[row[key]].qty += row.qty;
    acc[row[key]].kg += row.kg;
    acc[row[key]].rows += row.rows;
    return acc;
  }, {});
}

function top(rows, key) {
  return Object.entries(group(rows, key)).map(([name, values]) => ({ name, ...values })).sort((a, b) => b.amount - a.amount).slice(0, 10);
}

function Table({ rows, label }) {
  return <div className="tableWrap"><table><thead><tr><th>{label}</th><th>Amount</th></tr></thead><tbody>{rows.map((row) => <tr key={row.name}><td>{row.name}</td><td>{money(row.amount)}</td></tr>)}</tbody></table></div>;
}

function Bars({ rows }) {
  const max = Math.max(...rows.map((row) => row.amount), 1);
  return <div className="bars">{rows.map((row) => <div key={row.name} className="bar"><span>{row.name}</span><strong>{money(row.amount)}</strong><i style={{ width: `${Math.max(2, row.amount / max * 100)}%` }} /></div>)}</div>;
}

function Quality({ quality }) {
  return <div className="quality">{Object.entries(quality).map(([key, value]) => <div key={key}><span>{key}</span><strong>{Number(value).toLocaleString("th-TH")}</strong></div>)}</div>;
}

function LineChart({ data }) {
  const width = 760;
  const height = 250;
  const pad = 30;
  const max = Math.max(...data.flatMap((row) => typeOrder.map((type) => row[type] || 0)), 1);
  const colors = { "Actual 25/24": "#61707b", "Budget 25": "#b77935", "Budget 26": "#16675f" };
  const point = (value, index) => `${pad + (index / (data.length - 1)) * (width - pad * 2)},${height - pad - (value / max) * (height - pad * 2)}`;
  return <svg viewBox={`0 0 ${width} ${height}`} className="chart">{[0, .25, .5, .75, 1].map((tick) => <line key={tick} x1={pad} x2={width - pad} y1={height - pad - tick * (height - pad * 2)} y2={height - pad - tick * (height - pad * 2)} />)}{typeOrder.map((type) => <polyline key={type} points={data.map((row, index) => point(row[type] || 0, index)).join(" ")} fill="none" stroke={colors[type]} strokeWidth="3" />)}{data.map((row, index) => <text key={row.month} x={pad + (index / (data.length - 1)) * (width - pad * 2)} y={height - 8} textAnchor="middle">{row.month}</text>)}</svg>;
}
