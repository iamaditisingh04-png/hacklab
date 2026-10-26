# HackLab — Local Cybersecurity Playground

A beginner-friendly, full-stack security learning lab built with React, Vite, Express, and SQLite.

## Safety
- The backend binds to `127.0.0.1` only.
- The intentionally insecure scenarios are simulations; they do not execute attacker-supplied code or run a vulnerable server.
- This is a learning starter, not a production deployment template.
- Express's default in-memory session store is suitable only for local development. Replace it before production.
- Use only fictional demo data.

## Requirements
- Node.js 20+ and npm
- Windows, macOS, or Linux

## Run locally

Open a terminal in this folder and run:

```bash
npm install
npm run install:all
npm run dev
```

Then open http://127.0.0.1:5173

The Vite dev server proxies `/api` requests to the Express backend at `127.0.0.1:3001`.

## Demo accounts
Register your own account on the login screen. Passwords are hashed with bcrypt before storage.

## What is included
- Registration/login/logout using server-side sessions
- HTTP-only, SameSite cookies
- Password hashing
- Login rate limiting
- Helmet security headers
- Zod validation
- SQLite prepared statements
- Per-user task authorization
- Safe XSS, IDOR, and SQL injection learning simulations
- Basic security status panel

## Reset the local database
Stop the server, then delete `server/hacklab.sqlite`. It will be recreated next time you run the app.

## Before any public deployment
Do not deploy this starter as-is. At minimum, use a persistent production session store, HTTPS with secure cookies, CSRF protections appropriate to your architecture, strict origin/CORS configuration, secret management, database backups, dependency scanning, monitoring, and a security review. Remove or separately isolate all training simulations.
