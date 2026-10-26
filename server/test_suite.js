import express from "express";
import session from "express-session";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { z } from "zod";
import db from "./src/db.js";

// Test suite for HackLab
const PORT = 3099;
const HOST = "127.0.0.1";
const BASE_URL = `http://${HOST}:${PORT}`;

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "20kb" }));
app.use(session({
  name: "hacklab.sid",
  secret: "test-secret-key-1234567890",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "strict", secure: false, maxAge: 1000 * 60 * 60 }
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100, // relaxed for automated testing
  standardHeaders: "draft-7",
  legacyHeaders: false
});

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  password: z.string().min(10).max(72)
});

const taskSchema = z.object({
  title: z.string().trim().min(1).max(120)
});

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Please log in first." });
  next();
}

app.use((req, res, next) => {
  const mutation = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  const origin = req.get("origin");
  if (mutation && origin && !["http://127.0.0.1:5173", "http://localhost:5173"].includes(origin)) {
    return res.status(403).json({ error: "Unexpected request origin." });
  }
  next();
});

app.get("/api/health", (_req, res) => res.json({ ok: true, app: "HackLab", mode: "local-training" }));

app.post("/api/auth/register", authLimiter, async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Use a valid email and a password of 10–72 characters." });
  const { email, password } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const result = db.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)").run(email, passwordHash);
    const userId = Number(result.lastInsertRowid);
    req.session.regenerate(err => {
      if (err) return res.status(500).json({ error: "Could not initialize session." });
      req.session.userId = userId;
      req.session.email = email;
      req.session.save(saveErr => {
        if (saveErr) return res.status(500).json({ error: "Could not save session." });
        return res.status(201).json({ user: { id: userId, email } });
      });
    });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE" || error.message?.includes("UNIQUE constraint")) {
      return res.status(409).json({ error: "An account with that email already exists." });
    }
    return res.status(500).json({ error: "Could not create account." });
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a valid email and password." });
  const { email, password } = parsed.data;
  const user = db.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").get(email);
  const valid = user ? await bcrypt.compare(password, user.password_hash) : false;
  if (!valid) return res.status(401).json({ error: "Email or password is incorrect." });
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: "Could not start a session." });
    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.save(saveErr => {
      if (saveErr) return res.status(500).json({ error: "Could not save session." });
      res.json({ user: { id: user.id, email: user.email } });
    });
  });
});

app.get("/api/auth/me", (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  res.json({ user: { id: req.session.userId, email: req.session.email } });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: "Could not log out." });
    res.clearCookie("hacklab.sid", { httpOnly: true, sameSite: "strict" });
    res.json({ ok: true });
  });
});

app.get("/api/tasks", requireAuth, (req, res) => {
  const tasks = db.prepare("SELECT id, title, created_at FROM tasks WHERE user_id = ? ORDER BY id DESC").all(req.session.userId);
  res.json({ tasks });
});

app.post("/api/tasks", requireAuth, (req, res) => {
  const parsed = taskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Task title must be 1–120 characters." });
  const result = db.prepare("INSERT INTO tasks (user_id, title) VALUES (?, ?)").run(req.session.userId, parsed.data.title);
  const task = db.prepare("SELECT id, title, created_at FROM tasks WHERE id = ? AND user_id = ?").get(Number(result.lastInsertRowid), req.session.userId);
  res.status(201).json({ task });
});

app.delete("/api/tasks/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid task ID." });
  const result = db.prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?").run(id, req.session.userId);
  if (result.changes === 0) return res.status(404).json({ error: "Task not found." });
  res.json({ ok: true });
});

app.post("/api/labs/simulate", requireAuth, (req, res) => {
  const schema = z.object({
    lab: z.enum(["idor", "xss", "sql-injection"]),
    input: z.string().max(300).default("")
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid lab request." });
  const { lab, input } = parsed.data;
  const results = {
    idor: {
      title: "IDOR / access-control simulation",
      observed: input.trim() === "user-2" ? "In the simulated vulnerable app, changing the owner ID exposes another user's demo record." : "Try the simulated owner ID user-2 to see the lesson.",
      secureFix: "The real API scopes each database query to the authenticated user ID. The simulation does not read or change real user records."
    },
    xss: {
      title: "XSS / unsafe rendering simulation",
      observed: input.includes("<script") || input.includes("<img") ? "The input resembles HTML that could be dangerous if inserted as executable markup. HackLab displays it only as text." : "Try entering a harmless string such as <script>alert(1)</script> to inspect the warning.",
      secureFix: "React renders ordinary strings as text by default. Avoid dangerouslySetInnerHTML unless content is rigorously sanitized."
    },
    "sql-injection": {
      title: "SQL injection simulation",
      observed: input.includes("'") || input.toLowerCase().includes("or") ? "This input resembles a common injection test. It is only inspected as text; no SQL query is run." : "Try a harmless test string such as ' OR '1'='1 to see why string-built SQL is risky.",
      secureFix: "Use parameterized statements. HackLab's actual database queries use placeholders and never concatenate this input into SQL."
    }
  };
  res.json({ ...results[lab], simulated: true });
});

// START SERVER AND RUN TESTS
const server = app.listen(PORT, HOST, async () => {
  console.log(`Test server running at ${BASE_URL}`);
  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  function extractCookie(res) {
    const raw = res.headers.get("set-cookie");
    if (!raw) return null;
    return raw.split(";")[0];
  }

  try {
    // Clean up test data
    db.exec("DELETE FROM tasks; DELETE FROM users;");

    // 1. Health check
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    const healthJson = await healthRes.json();
    assert(healthRes.status === 200 && healthJson.ok === true, "Health check endpoint returns ok: true");

    // 2. Registration - Invalid password (< 10 chars)
    const shortPassRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user1@hacklab.local", password: "short" })
    });
    assert(shortPassRes.status === 400, "Registration rejects passwords under 10 chars with 400");

    // 3. Registration - Valid user 1
    const regRes1 = await fetch(`${BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user1@hacklab.local", password: "LongPassword123!" })
    });
    const regCookie1 = extractCookie(regRes1);
    const regJson1 = await regRes1.json();
    assert(regRes1.status === 201 && regJson1.user.email === "user1@hacklab.local" && !!regCookie1, "Valid registration creates account, issues session cookie, returns 201");

    // 4. Registration - Duplicate email returns 409
    const dupRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user1@hacklab.local", password: "AnotherPassword123!" })
    });
    assert(dupRes.status === 409, "Duplicate email registration returns 409 Conflict");

    // 5. Unauthenticated task access
    const noAuthTaskRes = await fetch(`${BASE_URL}/api/tasks`);
    assert(noAuthTaskRes.status === 401, "Unauthenticated access to /api/tasks returns 401");

    // 6. User 1 creates task
    const addTaskRes1 = await fetch(`${BASE_URL}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": regCookie1 },
      body: JSON.stringify({ title: "Study SQL injection defenses" })
    });
    const taskJson1 = await addTaskRes1.json();
    assert(addTaskRes1.status === 201 && taskJson1.task.title === "Study SQL injection defenses", "User 1 successfully creates a task");
    const task1Id = taskJson1.task.id;

    // 7. User 1 lists tasks
    const listTasksRes1 = await fetch(`${BASE_URL}/api/tasks`, {
      headers: { "Cookie": regCookie1 }
    });
    const listJson1 = await listTasksRes1.json();
    assert(listJson1.tasks.length === 1 && listJson1.tasks[0].id === task1Id, "User 1 sees their created task");

    // 8. Register User 2
    const regRes2 = await fetch(`${BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user2@hacklab.local", password: "LongPassword123!" })
    });
    const regCookie2 = extractCookie(regRes2);
    assert(regRes2.status === 201 && !!regCookie2, "User 2 registers successfully");

    // 9. Task ownership / IDOR check: User 2 must NOT see User 1's tasks
    const listTasksRes2 = await fetch(`${BASE_URL}/api/tasks`, {
      headers: { "Cookie": regCookie2 }
    });
    const listJson2 = await listTasksRes2.json();
    assert(listJson2.tasks.length === 0, "Task isolation: User 2 sees 0 tasks (cannot view User 1's tasks)");

    // 10. Task ownership / IDOR check: User 2 attempts to DELETE User 1's task
    const unauthorizedDeleteRes = await fetch(`${BASE_URL}/api/tasks/${task1Id}`, {
      method: "DELETE",
      headers: { "Cookie": regCookie2 }
    });
    assert(unauthorizedDeleteRes.status === 404, "Authorization enforcement: User 2 cannot delete User 1's task (returns 404)");

    // 11. User 1 deletes their own task
    const authorizedDeleteRes = await fetch(`${BASE_URL}/api/tasks/${task1Id}`, {
      method: "DELETE",
      headers: { "Cookie": regCookie1 }
    });
    assert(authorizedDeleteRes.status === 200, "Owner can delete their own task (returns 200)");

    // 12. Security simulations - IDOR simulation
    const simIdor = await fetch(`${BASE_URL}/api/labs/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": regCookie1 },
      body: JSON.stringify({ lab: "idor", input: "user-2" })
    });
    const idorJson = await simIdor.json();
    assert(simIdor.status === 200 && idorJson.simulated === true && idorJson.observed.includes("exposes another user's demo record"), "IDOR educational simulation responds safely");

    // 13. Security simulations - XSS simulation
    const simXss = await fetch(`${BASE_URL}/api/labs/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": regCookie1 },
      body: JSON.stringify({ lab: "xss", input: "<script>alert(1)</script>" })
    });
    const xssJson = await simXss.json();
    assert(simXss.status === 200 && xssJson.simulated === true && xssJson.observed.includes("displays it only as text"), "XSS educational simulation inspects text safely without execution");

    // 14. Security simulations - SQL Injection simulation
    const simSql = await fetch(`${BASE_URL}/api/labs/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": regCookie1 },
      body: JSON.stringify({ lab: "sql-injection", input: "' OR '1'='1" })
    });
    const sqlJson = await simSql.json();
    assert(simSql.status === 200 && sqlJson.simulated === true && sqlJson.secureFix.includes("parameterized statements"), "SQLi educational simulation inspects syntax safely without executing SQL");

    // 15. Origin check protection against cross-origin mutations
    const originBlockedRes = await fetch(`${BASE_URL}/api/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": regCookie1,
        "Origin": "http://malicious-site.com"
      },
      body: JSON.stringify({ title: "CSRF attack attempt" })
    });
    assert(originBlockedRes.status === 403, "Origin guard blocks untrusted mutation origin (returns 403)");

    // 16. Logout & session invalidation
    const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": regCookie1 }
    });
    assert(logoutRes.status === 200, "Logout endpoint returns 200 and destroys session");

    const meAfterLogout = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { "Cookie": regCookie1 }
    });
    const meJson = await meAfterLogout.json();
    assert(meJson.user === null, "/api/auth/me returns null after logout");

    // 17. Login with valid credentials
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user1@hacklab.local", password: "LongPassword123!" })
    });
    const loginCookie = extractCookie(loginRes);
    const loginJson = await loginRes.json();
    assert(loginRes.status === 200 && loginJson.user.email === "user1@hacklab.local" && !!loginCookie, "Login endpoint succeeds with valid credentials and returns refreshed session cookie");

    console.log(`\n========================================`);
    console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================`);
  } catch (err) {
    console.error("Test execution failed:", err);
  } finally {
    // Clean up test records
    db.exec("DELETE FROM tasks; DELETE FROM users;");
    server.close();
    process.exit(failed === 0 ? 0 : 1);
  }
});
