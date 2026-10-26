import { useEffect, useState } from "react";
import {
  Shield, Terminal, LockKeyhole, Database, KeyRound, Bug, ScanSearch,
  Server, LogOut, Plus, Trash2, CheckCircle2, AlertTriangle, ChevronRight,
  Activity, BookOpen, Code2, Menu, X
} from "lucide-react";

const labs = [
  { id: "idor", number: "01", title: "Access Control / IDOR", icon: Database, tag: "AUTHORIZATION", description: "See why changing a record owner ID can expose another user's data." },
  { id: "xss", number: "02", title: "Cross-site Scripting", icon: Code2, tag: "INPUT SAFETY", description: "Inspect suspicious HTML safely and learn why rendering as text matters." },
  { id: "sql-injection", number: "03", title: "SQL Injection", icon: Bug, tag: "DATABASE", description: "Explore an injection-shaped string without executing any SQL." }
];

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [active, setActive] = useState("overview");
  const [tasks, setTasks] = useState([]);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskError, setTaskError] = useState("");
  const [selectedLab, setSelectedLab] = useState("idor");
  const [labInput, setLabInput] = useState("user-2");
  const [labResult, setLabResult] = useState(null);
  const [labError, setLabError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notice, setNotice] = useState("");

  async function loadTasks() {
    const data = await api("/api/tasks");
    setTasks(data.tasks);
  }

  useEffect(() => {
    api("/api/auth/me")
      .then(data => {
        setUser(data.user);
        if (data.user) return loadTasks();
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  async function submitAuth(e) {
    e.preventDefault();
    setAuthError("");
    try {
      const data = await api(`/api/auth/${mode === "register" ? "register" : "login"}`, {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      setUser(data.user);
      setPassword("");
      setNotice(mode === "register" ? "Account created. Welcome to HackLab." : "Authentication successful.");
      await loadTasks();
    } catch (err) {
      setAuthError(err.message);
    }
  }

  async function logout() {
    try { await api("/api/auth/logout", { method: "POST", body: "{}" }); } catch {}
    setUser(null);
    setTasks([]);
    setActive("overview");
  }

  async function addTask(e) {
    e.preventDefault();
    setTaskError("");
    try {
      await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: taskTitle }) });
      setTaskTitle("");
      await loadTasks();
    } catch (err) { setTaskError(err.message); }
  }

  async function deleteTask(id) {
    try {
      await api(`/api/tasks/${id}`, { method: "DELETE" });
      await loadTasks();
    } catch (err) { setTaskError(err.message); }
  }

  async function runLab(e) {
    e.preventDefault();
    setLabError("");
    setLabResult(null);
    try {
      const data = await api("/api/labs/simulate", {
        method: "POST",
        body: JSON.stringify({ lab: selectedLab, input: labInput })
      });
      setLabResult(data);
    } catch (err) { setLabError(err.message); }
  }

  if (checking) return <div className="loading"><div className="loader" /><span>INITIALIZING SECURE SESSION...</span></div>;

  if (!user) return (
    <main className="auth-screen">
      <div className="auth-glow" />
      <div className="auth-card">
        <div className="brand-mark"><Shield size={25} /><span>HACK<span className="green">LAB</span></span></div>
        <div className="eyebrow"><span className="pulse" /> LOCAL TRAINING ENVIRONMENT</div>
        <h1>Learn to think<br /><span className="green">like a defender.</span></h1>
        <p className="muted">A hands-on cybersecurity playground. Practice safe simulations, understand the risk, and learn the fix.</p>
        <form className="auth-form" onSubmit={submitAuth}>
          <label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required maxLength={254} /></label>
          <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 10 characters" autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={10} maxLength={72} /></label>
          {authError && <div className="error-message">{authError}</div>}
          <button className="primary-btn full" type="submit">{mode === "register" ? "CREATE LOCAL ACCOUNT" : "SIGN IN"} <ChevronRight size={17} /></button>
        </form>
        <p className="switch-mode">{mode === "register" ? "Already registered?" : "New to the lab?"} <button onClick={() => { setMode(mode === "register" ? "login" : "register"); setAuthError(""); }}>{mode === "register" ? "Sign in" : "Create an account"}</button></p>
        <div className="local-note"><LockKeyhole size={14} /> Local demo only · Never use a real password</div>
      </div>
      <div className="auth-side">
        <div className="terminal-window">
          <div className="terminal-top"><span /><span /><span /><label>hacklab@localhost:~</label></div>
          <div className="terminal-body">
            <p><span className="term-green">root@hacklab</span>:~$ initialize --safe-mode</p>
            <p className="term-dim">Loading training modules...</p>
            <p><span className="term-green">[OK]</span> Authentication lab ready</p>
            <p><span className="term-green">[OK]</span> Database sandbox isolated</p>
            <p><span className="term-green">[OK]</span> Attack payload execution disabled</p>
            <p><span className="term-green">[OK]</span> Local-only network binding</p>
            <p className="term-dim">Waiting for learner<span className="cursor">_</span></p>
          </div>
        </div>
        <div className="auth-side-caption"><Activity size={16} /> LEARN. TEST. PATCH. REPEAT.</div>
      </div>
    </main>
  );

  const nav = [
    { id: "overview", label: "Overview", icon: Activity, group: "WORKSPACE" },
    { id: "labs", label: "Security Labs", icon: Bug, group: "WORKSPACE" },
    { id: "tasks", label: "My Learning Tasks", icon: CheckCircle2, group: "WORKSPACE" },
    { id: "audit", label: "Security Checklist", icon: ScanSearch, group: "TOOLS" }
  ];

  function navigate(id) { setActive(id); setSidebarOpen(false); setNotice(""); }

  return (
    <div className="app-shell">
      {sidebarOpen && <button className="mobile-backdrop" aria-label="Close menu" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand"><div className="brand-icon"><Shield size={21} /></div><span>HACK<span className="green">LAB</span><small>CYBERSECURITY PLAYGROUND</small></span><button className="mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={18}/></button></div>
        <div className="environment"><span className="pulse" /> LOCAL SANDBOX <span className="env-dot">●</span></div>
        <div className="nav-list">
          {nav.map(item => <div key={item.id}>
            {nav.findIndex(n => n.group === item.group) === nav.indexOf(item) && <div className="nav-group">{item.group}</div>}
            <button className={`nav-item ${active === item.id ? "active" : ""}`} onClick={() => navigate(item.id)}><item.icon size={17} /><span>{item.label}</span>{active === item.id && <span className="nav-active-mark" />}</button>
          </div>)}
        </div>
        <div className="sidebar-bottom">
          <div className="profile"><div className="avatar">{user.email[0].toUpperCase()}</div><div className="profile-info"><strong>{user.email}</strong><small>LOCAL LEARNER</small></div><button title="Log out" onClick={logout}><LogOut size={16}/></button></div>
          <div className="version">HACKLAB v1.0.0 <span>● ONLINE</span></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><button className="mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu size={20}/></button><span>HACKLAB</span><ChevronRight size={14}/><strong>{nav.find(n => n.id === active)?.label || "Overview"}</strong></div>
          <div className="topbar-right"><span className="secure-indicator"><span className="pulse" /> LOCAL MODE</span><div className="top-avatar">{user.email[0].toUpperCase()}</div></div>
        </header>

        <div className="content">
          {notice && <div className="notice"><CheckCircle2 size={16}/>{notice}<button onClick={() => setNotice("")}>×</button></div>}
          {active === "overview" && <>
            <div className="welcome-row"><div><div className="eyebrow">YOUR SECURITY WORKSPACE</div><h1>Welcome to the <span className="green">lab.</span></h1><p className="muted">Learn the weakness. Understand the impact. Ship the fix.</p></div><div className="status-pill"><span className="pulse"/><span>ALL SYSTEMS LOCAL</span></div></div>
            <div className="hero-panel"><div className="hero-grid" /><div className="hero-copy"><div className="hero-label"><Terminal size={14}/> MISSION BRIEFING // 001</div><h2>Think like an attacker.<br/><span className="green">Build like a defender.</span></h2><p>Explore common web security failures in a controlled sandbox, then learn how real applications prevent them.</p><button className="primary-btn" onClick={() => navigate("labs")}>ENTER SECURITY LABS <ChevronRight size={17}/></button></div><div className="hero-emblem"><div className="emblem-ring"><Shield size={58}/><span className="emblem-cross">+</span></div><div className="emblem-caption">DEFENSE SYSTEM<br/><span>ACTIVE</span></div></div><div className="hero-code">01001000<br/>01000001<br/>01000011<br/>01001011</div></div>
            <div className="section-heading"><div><h2>Learning modules</h2><p>Three safe simulations to get started</p></div><button className="text-btn" onClick={() => navigate("labs")}>VIEW ALL <ChevronRight size={15}/></button></div>
            <div className="lab-grid">{labs.map(lab => <LabCard key={lab.id} lab={lab} onClick={() => { setSelectedLab(lab.id); setLabResult(null); navigate("labs"); }} />)}</div>
            <div className="section-heading task-heading"><div><h2>My learning tasks</h2><p>Keep track of what you want to practice</p></div><button className="text-btn" onClick={() => navigate("tasks")}>OPEN TASKS <ChevronRight size={15}/></button></div>
            <TaskPanel tasks={tasks.slice(0, 3)} onAdd={addTask} onDelete={deleteTask} taskTitle={taskTitle} setTaskTitle={setTaskTitle} taskError={taskError} compact />
          </>}

          {active === "labs" && <><PageTitle eyebrow="HANDS-ON TRAINING" title={<>Security <span className="green">labs.</span></>} description="Simulations only. No payloads are executed and no real database is attacked."/><div className="lab-layout"><div className="lab-picker">{labs.map(lab => <button key={lab.id} onClick={() => {setSelectedLab(lab.id);setLabResult(null);setLabError("");}} className={`lab-option ${selectedLab === lab.id ? "selected" : ""}`}><lab.icon size={19}/><span><strong>{lab.title}</strong><small>{lab.tag}</small></span><ChevronRight size={16}/></button>)}</div><div className="lab-workspace"><div className="workspace-head"><div><span className="live-dot"/> INTERACTIVE SIMULATION</div><span className="safe-label"><Shield size={13}/> SAFE MODE</span></div><div className="workspace-body"><div className="lab-number">LAB / {labs.find(l => l.id === selectedLab)?.number}</div><h2>{labs.find(l => l.id === selectedLab)?.title}</h2><p className="muted">{labs.find(l => l.id === selectedLab)?.description}</p><form onSubmit={runLab} className="simulation-form"><label htmlFor="lab-input">TEST INPUT <span>MAX 300 CHARACTERS</span></label><textarea id="lab-input" maxLength={300} value={labInput} onChange={e => setLabInput(e.target.value)} spellCheck="false"/><div className="form-hint"><LockKeyhole size={13}/> This input is analyzed as text only. It is never executed.</div><button className="primary-btn" type="submit">RUN SIMULATION <ChevronRight size={16}/></button></form>{labError && <div className="error-message">{labError}</div>}{labResult && <div className="result-card"><div className="result-title"><AlertTriangle size={18}/><strong>{labResult.title}</strong><span>SIMULATED</span></div><div className="result-section"><label>OBSERVATION</label><p>{labResult.observed}</p></div><div className="result-section fix"><label><CheckCircle2 size={14}/> SECURE FIX</label><p>{labResult.secureFix}</p></div></div>}<div className="code-note"><BookOpen size={16}/><div><strong>What you're learning</strong><p>Real security depends on server-side checks and safe data handling. These examples are educational simulations, not a scanner or proof of security.</p></div></div></div></div></div></>}

          {active === "tasks" && <><PageTitle eyebrow="PERSONAL WORKSPACE" title={<>Learning <span className="green">tasks.</span></>} description="Tasks are private to your account. Try creating a task, then test isolation with a second account."/><TaskPanel tasks={tasks} onAdd={addTask} onDelete={deleteTask} taskTitle={taskTitle} setTaskTitle={setTaskTitle} taskError={taskError}/><div className="info-banner"><Shield size={18}/><div><strong>Authorization is enforced on the server</strong><p>Each task query is scoped to the authenticated user's ID. The backend does not trust a user-supplied owner ID.</p></div></div></>}

          {active === "audit" && <><PageTitle eyebrow="DEFENSE CENTER" title={<>Security <span className="green">checklist.</span></>} description="Use this checklist to guide manual verification. Checking a box records your progress; it does not run a scan."/><AuditChecklist/><div className="info-banner"><AlertTriangle size={18}/><div><strong>Not a production security certification</strong><p>Automated checks and this learning checklist cannot prove an app is secure. Review the architecture and test authorization paths before launch.</p></div></div></>}
        </div>
        <footer><span><Shield size={13}/> HACKLAB // LEARN SAFELY</span><span>BUILT FOR LOCAL TRAINING <span className="footer-green">●</span></span></footer>
      </main>
    </div>
  );
}

function PageTitle({ eyebrow, title, description }) {
  return <div className="page-title"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="muted">{description}</p></div>;
}

function LabCard({ lab, onClick }) {
  return <button className="lab-card" onClick={onClick}><div className="lab-card-top"><div className="lab-icon"><lab.icon size={20}/></div><span className="lab-num">LAB_{lab.number}</span></div><div className="lab-tag">{lab.tag}</div><h3>{lab.title}</h3><p>{lab.description}</p><div className="lab-card-bottom"><span><span className="tiny-dot"/> SIMULATION READY</span><ChevronRight size={17}/></div></button>;
}

function TaskPanel({ tasks, onAdd, onDelete, taskTitle, setTaskTitle, taskError, compact = false }) {
  return <section className="task-panel"><form className="task-form" onSubmit={onAdd}><input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="e.g. Learn how session cookies work..." maxLength={120} required/><button className="primary-btn" type="submit"><Plus size={16}/> ADD TASK</button></form>{taskError && <div className="error-message">{taskError}</div>}{tasks.length === 0 ? <div className="empty-state"><CheckCircle2 size={26}/><strong>No learning tasks yet</strong><p>Add a task to track your security learning goals.</p></div> : <div className="task-list">{tasks.map(task => <div className="task-row" key={task.id}><span className="task-check"><CheckCircle2 size={17}/></span><span className="task-name">{task.title}</span><span className="task-date">{new Date(task.created_at + "Z").toLocaleDateString()}</span><button className="icon-btn" title="Delete task" onClick={() => onDelete(task.id)}><Trash2 size={15}/></button></div>)}</div>}{compact && tasks.length > 0 && <p className="muted small-note">Showing your latest tasks.</p>}</section>;
}

function AuditChecklist() {
  const items = [
    ["Authentication", "Login routes verify credentials and hash passwords."],
    ["Authorization", "User A cannot read or modify User B's records."],
    ["Secrets", "No private keys or credentials appear in client code."],
    ["Input handling", "Server validates inputs and uses safe query parameters."],
    ["Abuse prevention", "Login and expensive endpoints have appropriate limits."],
    ["Transport and headers", "Production uses HTTPS and reviewed security headers."],
    ["Dependencies", "Dependency audit findings are reviewed and resolved."],
    ["Recovery and monitoring", "Backups, logs, and recovery procedures are tested."]
  ];
  const [checked, setChecked] = useState([]);
  return <div className="audit-list"><div className="audit-progress"><div><strong>{checked.length} / {items.length}</strong><span>CHECKS MARKED REVIEWED</span></div><div className="progress-track"><div style={{width: `${checked.length / items.length * 100}%`}}/></div></div>{items.map(([title, desc], i) => <label className="audit-row" key={title}><input type="checkbox" checked={checked.includes(i)} onChange={e => setChecked(old => e.target.checked ? [...old, i] : old.filter(x => x !== i))}/><span className="fake-check"><CheckCircle2 size={17}/></span><span className="audit-text"><strong>{title}</strong><small>{desc}</small></span><span className="audit-status">{checked.includes(i) ? "REVIEWED" : "PENDING"}</span></label>)}</div>;
}

export default App;

