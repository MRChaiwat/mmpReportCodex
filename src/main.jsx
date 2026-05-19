import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const typeOrder = ["Actual 25/24", "Budget 25", "Budget 26"];
const monthOrder = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatMoney(value) {
  const number = Number(value || 0);
  if (Math.abs(number) >= 1_000_000_000) return `${(number / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  return number.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

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

function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    api("/api/me")
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setBooting(false));
  }, []);

  if (booting) return <div className="boot">Loading dashboard...</div>;
  if (!user) return <Login onLogin={setUser} />;
  return <DashboardShell user={user} onLogout={() => setUser(null)} />;
}

function Login({ onLogin }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="loginPage">
      <section className="loginPanel">
        <div>
          <p className="appName">MMP Budget</p>
          <h1>เข้าสู่ระบบ Dashboard</h1>
          <p className="muted">ดู Budget 26, Budget 25 และ Actual จากไฟล์ Excel ที่อัปโหลดล่าสุด</p>
        </div>
        <form onSubmit={submit} className="loginForm">
          <label>
            Username
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
          </label>
          {error ? <p className="errorText">{error}</p> : null}
          <button disabled={loading}>{loading ? "กำลังเข้า..." : "Login"}</button>
        </form>
        <div className="demoUsers">
          <span>Demo:</span>
          <code>admin/admin123</code>
          <code>manager/manager123</code>
          <code>sales/sales123</code>
        </div>
      </section>
    </main>
  );
}

function DashboardShell({ user, onLogout }) {
  const [dashboard, setDashboard] = useState(null);
  const [status, setStatus] = useState("loading");
  const [filters, setFilters] = useState({ area: "All", sales: "All", productGroup: "All" });

  async function loadDashboard() {
    setStatus("loading");
    try {
      const data = await api("/api/dashboard");
      setDashboard(data);
      setStatus("ready");
    } catch (err) {
      setStatus(err.message);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  async function logout() {
    await api("/api/logout", { method: "POST" }).catch(() => {});
    onLogout();
  }

  return (
    <main className="appShell">
      <aside className="sidebar">
        <div>
          <p className="appName">MMP Budget</p>
          <h2>Sales Budget 2026</h2>
        </div>
        <nav>
          <a className="active">Dashboard</a>
          <a>Imports</a>
          <a>Users</a>
        </nav>
        <div className="userBox">
          <span>{user.name}</span>
          <strong>{user.role}</strong>
          <button onClick={logout}>Logout</button>
        </div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>Budget Performance</h1>
            <p>{dashboard?.meta ? `อัปเดตจาก ${dashboard.meta.sourceFile} • ${new Date(dashboard.meta.importedAt).toLocaleString("th-TH")}` : "ยังไม่มีข้อมูลนำเข้า"}</p>
          </div>
          {user.role === "admin" ? <Uploader onUploaded={loadDashboard} /> : null}
        </header>
        {status === "loading" ? <div className="statePanel">กำลังโหลดข้อมูล...</div> : null}
        {dashboard?.empty ? <EmptyState user={user} /> : null}
        {dashboard && !dashboard.empty ? (
          <Dashboard dashboard={dashboard} filters={filters} setFilters={setFilters} />
        ) : null}
      </section>
    </main>
  );
}

function Uploader({ onUploaded }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function uploadFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMessage("กำลัง import ไฟล์...");
    try {
      const body = new FormData();
      body.append("file", file);
      const result = await api("/api/upload", { method: "POST", body });
      setMessage(`นำเข้าแล้ว ${result.meta.rowCount.toLocaleString("th-TH")} rows`);
      await onUploaded();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  return (
    <label className={`uploadButton ${busy ? "busy" : ""}`}>
      <input type="file" accept=".xlsx,.xls" onChange={uploadFile} disabled={busy} />
      {busy ? "Importing..." : "Upload Excel"}
      {message ? <span>{message}</span> : null}
    </label>
  );
}

function EmptyState({ user }) {
  return (
    <section className="statePanel">
      <h2>ยังไม่มีข้อมูล Dashboard</h2>
      <p>{user.role === "admin" ? "อัปโหลดไฟล์ data budget.xlsx เพื่อสร้าง dashboard อัตโนมัติ" : "รอ admin อัปโหลดไฟล์ Excel ก่อน"}</p>
    </section>
  );
}

function Dashboard({ dashboard, filters, setFilters }) {
  const filteredRows = useMemo(() => {
    return dashboard.cube.filter((row) => {
      if (filters.area !== "All" && row.area !== filters.area) return false;
      if (filters.sales !== "All" && row.sales !== filters.sales) return false;
      if (filters.productGroup !== "All" && row.productGroup !== filters.productGroup) return false;
      return true;
    });
  }, [dashboard, filters]);

  const totals = useMemo(() => aggregateBy(filteredRows, "type"), [filteredRows]);
  const monthly = useMemo(() => monthOrder.map((month) => ({ month, ...aggregateTypes(filteredRows.filter((row) => row.month === month)) })), [filteredRows]);
  const areaRows = useMemo(() => topBy(filteredRows, "area", 10), [filteredRows]);
  const salesRows = useMemo(() => topBy(filteredRows, "sales", 10), [filteredRows]);
  const productRows = useMemo(() => topBy(filteredRows, "productGroup", 10), [filteredRows]);

  const budget26 = totals["Budget 26"]?.amount || 0;
  const budget25 = totals["Budget 25"]?.amount || 0;
  const actual = totals["Actual 25/24"]?.amount || 0;
  const growthVsBudget = budget25 ? (budget26 - budget25) / budget25 : Number.NaN;
  const growthVsActual = actual ? (budget26 - actual) / actual : Number.NaN;

  return (
    <>
      <section className="filters">
        <Select label="Area" value={filters.area} options={["All", ...dashboard.filters.areas]} onChange={(area) => setFilters({ ...filters, area })} />
        <Select label="Sales" value={filters.sales} options={["All", ...dashboard.filters.sales]} onChange={(sales) => setFilters({ ...filters, sales })} />
        <Select label="Product Group" value={filters.productGroup} options={["All", ...dashboard.filters.productGroups]} onChange={(productGroup) => setFilters({ ...filters, productGroup })} />
      </section>

      <section className="kpiGrid">
        <Kpi title="Budget 26" value={formatMoney(budget26)} detail={`${filteredRows.length.toLocaleString("th-TH")} aggregate rows`} tone="accent" />
        <Kpi title="Budget 25" value={formatMoney(budget25)} detail={`B26 vs B25 ${formatPercent(growthVsBudget)}`} />
        <Kpi title="Actual 25/24" value={formatMoney(actual)} detail={`B26 vs Actual ${formatPercent(growthVsActual)}`} />
        <Kpi title="Budget Gap" value={formatMoney(budget26 - budget25)} detail="Budget 26 minus Budget 25" tone={budget26 >= budget25 ? "good" : "bad"} />
      </section>

      <section className="mainGrid">
        <Panel title="Monthly Amount Trend" span>
          <LineChart data={monthly} />
        </Panel>
        <Panel title="Area Performance">
          <RankingTable rows={areaRows} label="Area" />
        </Panel>
        <Panel title="Top Sales">
          <RankingTable rows={salesRows} label="Sales" />
        </Panel>
        <Panel title="Product Group Mix" span>
          <BarList rows={productRows} />
        </Panel>
        <Panel title="Data Quality">
          <Quality quality={dashboard.quality} />
        </Panel>
      </section>
    </>
  );
}

function Select({ label, value, options, onChange }) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Kpi({ title, value, detail, tone = "" }) {
  return (
    <article className={`kpi ${tone}`}>
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function Panel({ title, children, span = false }) {
  return (
    <section className={`panel ${span ? "span" : ""}`}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function aggregateBy(rows, key) {
  return rows.reduce((acc, row) => {
    acc[row[key]] ||= { amount: 0, qty: 0, kg: 0, rows: 0 };
    acc[row[key]].amount += row.amount;
    acc[row[key]].qty += row.qty;
    acc[row[key]].kg += row.kg;
    acc[row[key]].rows += row.rows;
    return acc;
  }, {});
}

function aggregateTypes(rows) {
  const grouped = aggregateBy(rows, "type");
  return Object.fromEntries(typeOrder.map((type) => [type, grouped[type]?.amount || 0]));
}

function topBy(rows, key, limit) {
  return Object.entries(aggregateBy(rows, key))
    .map(([name, value]) => ({ name, ...value }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

function LineChart({ data }) {
  const width = 760;
  const height = 260;
  const pad = 32;
  const max = Math.max(...data.flatMap((item) => typeOrder.map((type) => item[type] || 0)), 1);
  const colors = {
    "Actual 25/24": "#5b6c7a",
    "Budget 25": "#d6923d",
    "Budget 26": "#176c63"
  };

  function point(value, index) {
    const x = pad + (index / (data.length - 1)) * (width - pad * 2);
    const y = height - pad - (value / max) * (height - pad * 2);
    return `${x},${y}`;
  }

  return (
    <div className="chartWrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Monthly trend">
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
          <line key={tick} x1={pad} x2={width - pad} y1={height - pad - tick * (height - pad * 2)} y2={height - pad - tick * (height - pad * 2)} className="gridLine" />
        ))}
        {typeOrder.map((type) => (
          <polyline key={type} points={data.map((row, index) => point(row[type] || 0, index)).join(" ")} fill="none" stroke={colors[type]} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {data.map((row, index) => (
          <text key={row.month} x={pad + (index / (data.length - 1)) * (width - pad * 2)} y={height - 8} textAnchor="middle" className="axisText">
            {row.month}
          </text>
        ))}
      </svg>
      <div className="legend">
        {typeOrder.map((type) => (
          <span key={type}><i style={{ background: colors[type] }} />{type}</span>
        ))}
      </div>
    </div>
  );
}

function RankingTable({ rows, label }) {
  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            <th>{label}</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td>{row.name}</td>
              <td>{formatMoney(row.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BarList({ rows }) {
  const max = Math.max(...rows.map((row) => row.amount), 1);
  return (
    <div className="barList">
      {rows.map((row) => (
        <div className="barRow" key={row.name}>
          <span>{row.name}</span>
          <strong>{formatMoney(row.amount)}</strong>
          <i style={{ width: `${Math.max(3, (row.amount / max) * 100)}%` }} />
        </div>
      ))}
    </div>
  );
}

function Quality({ quality }) {
  const items = [
    ["Missing Amount", quality.missingAmount],
    ["Missing Sales", quality.missingSales],
    ["Missing YYMM", quality.missingYymm],
    ["Missing Kg", quality.missingKg],
    ["Missing Product ID", quality.missingProductId],
    ["Unknown Month", quality.unknownMonthRows],
    ["Area 6 Budget 26 Rows", quality.area6Budget26Rows]
  ];
  return (
    <div className="qualityList">
      {items.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{Number(value || 0).toLocaleString("th-TH")}</strong>
        </div>
      ))}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
