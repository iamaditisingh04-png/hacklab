import express from "express";
import session from "express-session";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { z } from "zod";
import db from "./db.js";

const app = express();
const HOST = "127.0.0.1";
const PORT = 3001;

// Local-development configuration only. Never use MemoryStore for production.
app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use(express.json({ limit: "20kb" }));

app.use(session({
  name: "hacklab.sid",
  secret: process.env.SESSION_SECRET || "local-only-change-this-before-any-real-deployment",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "strict",
    secure: false, // localhost HTTP only; set true behind HTTPS in production
    maxAge: 1000 * 60 * 60 * 2
  }
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many attempts. Wait a little and try again." }
});

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  password: z.string().min(10).max(72)
});

const taskSchema = z.object({
  title: z.string().trim().min(1).max(120)
});

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Please log in first." });
  }
  next();
}

// Basic same-origin guard for browser mutations in this local demo.
// For production, implement CSRF protection suited to the deployment architecture.
app.use((req, res, next) => {
  const mutation = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  const origin = req.get("origin");
  if (mutation && origin && !["http://127.0.0.1:5173", "http://localhost:5173"].includes(origin)) {
    return res.status(403).json({ error: "Unexpected request origin." });
  }
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "HackLab", mode: "local-training" });
});

app.post("/api/auth/register", authLimiter, async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Use a valid email and a password of 10–72 characters." });
  }

  const { email, password } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const result = db.prepare(
      "INSERT INTO users (email, password_hash) VALUES (?, ?)"
    ).run(email, passwordHash);
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
    console.error("Registration failed:", error.message);
    return res.status(500).json({ error: "Could not create account." });
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Enter a valid email and password." });
  }
  const { email, password } = parsed.data;
  const user = db.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").get(email);
  const valid = user ? await bcrypt.compare(password, user.password_hash) : false;

  if (!valid) {
    return res.status(401).json({ error: "Email or password is incorrect." });
  }

  // Regenerate session after authentication to reduce session-fixation risk.
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
  const tasks = db.prepare(
    "SELECT id, title, created_at FROM tasks WHERE user_id = ? ORDER BY id DESC"
  ).all(req.session.userId);
  res.json({ tasks });
});

app.post("/api/tasks", requireAuth, (req, res) => {
  const parsed = taskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Task title must be 1–120 characters." });

  const result = db.prepare(
    "INSERT INTO tasks (user_id, title) VALUES (?, ?)"
  ).run(req.session.userId, parsed.data.title);

  const task = db.prepare(
    "SELECT id, title, created_at FROM tasks WHERE id = ? AND user_id = ?"
  ).get(Number(result.lastInsertRowid), req.session.userId);

  res.status(201).json({ task });
});

app.delete("/api/tasks/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid task ID." });

  // Ownership is part of the query, so users cannot delete someone else's task by changing the ID.
  const result = db.prepare(
    "DELETE FROM tasks WHERE id = ? AND user_id = ?"
  ).run(id, req.session.userId);

  if (result.changes === 0) return res.status(404).json({ error: "Task not found." });
  res.json({ ok: true });
});

// Educational scenarios are simulations only: no payload is executed and no real DB is attacked.
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

app.use((err, _req, res, _next) => {
  console.error("Unexpected error:", err.message);
  res.status(500).json({ error: "Unexpected server error." });
});

app.listen(PORT, HOST, () => {
  console.log(`HackLab API listening locally at http://${HOST}:${PORT}`);
});
