# Graegon

A private, invite-only group chat. React (CRA) single-page app backed by Firebase
Authentication and Cloud Firestore, deployed to GitHub Pages.

**Live site:** https://TROJAN-XX.github.io/graegon
**Firebase project:** `graegonx` (Firestore `asia-south1`)

---

## Table of contents

- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Scripts](#scripts)
- [Documentation map](#documentation-map)
- [Security model at a glance](#security-model-at-a-glance)

---

## How it works

1. A visitor registers with email/password. The account is created with
   `role: "user"`, `status: "pending"` and lands on the **Waiting** screen.
2. An admin approves the request from the **Admin Panel**
   (`/#/admin`), or shares a regenerated invite link
   (`/#/join/<inviteCode>`).
3. Once `status` becomes `approved` (or the user is an admin),
   `ProtectedRoute` lets them into the **Chat** screen.
4. Chat state (messages, typing, presence, read receipts, reactions) is written
   straight to Firestore and streamed back with `onSnapshot` listeners — there is
   no custom backend.

Routing uses `HashRouter` on purpose: GitHub Pages cannot serve SPA fallback
routes, so hash URLs (`/#/chat`) are the only ones that work without a server.

---

## Quick start

```bash
# 1. install dependencies (Node 18+, npm 9+)
npm ci

# 2. run the dev server on http://localhost:3000
npm start

# 3. production build -> build/
npm run build

# 4. tests (watch mode by default)
npm test -- --watchAll=false
```

There is nothing else to configure for local development: `src/firebase.js`
ships with the public Firebase web config of project `graegonx`.
To point the app at another Firebase project, see
[development.md](development.md#2-environment-configuration).

You need a first admin: register once in the app, then promote the user in the
Firebase console (`users/<uid>` -> set `role` to `"admin"`), or run the
one-line bootstrap described in [development.md](development.md#9-bootstrap-the-first-admin).

---

## Tech stack

| Layer        | Choice                         | Notes                                   |
| ------------ | ------------------------------ | --------------------------------------- |
| UI           | React 19.2 + CRA 5.0.1         | `react-scripts`, no custom webpack config |
| Routing      | `react-router-dom` 7 (`HashRouter`) | GitHub Pages compatible            |
| Auth         | Firebase Authentication        | Email + password                        |
| Database     | Cloud Firestore                | Realtime `onSnapshot` listeners         |
| Styling      | Plain CSS (`src/styles/global.css`) | Dark theme, responsive, no CSS framework |
| Hosting      | GitHub Pages                   | `gh-pages` branch, published by CI      |
| CI/CD        | GitHub Actions                 | `.github/workflows/deploy.yaml`         |
| Agent skills | `.agents/skills` (pinned)      | Locked by `skills-lock.json`            |

---

## Project structure

```text
graegon/
|-- .github/
|   `-- workflows/
|       `-- deploy.yaml          # build -> test -> publish gh-pages
|-- .agents/skills/              # pinned agent skills (see skills-lock.json)
|-- build/                       # CRA output - gitignored, built by CI
|-- public/                      # static template (index.html, manifest, icons)
|-- src/
|   |-- components/
|   |   |-- Footer.jsx           # global footer
|   |   |-- LoadingScreen.jsx    # spinner used while checking access
|   |   |-- ProtectedRoute.jsx   # auth + role gate for /chat and /admin
|   |   |-- MessageInput.jsx     # EMPTY - pending (see pendingworks.md)
|   |   |-- MessageList.jsx      # EMPTY - pending
|   |   `-- UserRequestCard.jsx  # EMPTY - pending
|   |-- pages/
|   |   |-- Login.jsx            # sign in / request access  -> /
|   |   |-- JoinGroup.jsx        # invite validation         -> /join/:inviteCode
|   |   |-- Waiting.jsx          # pending approval screen   -> /waiting
|   |   |-- Chat.jsx             # the chat client (largest file)
|   |   `-- AdminPanel.jsx       # approvals + invite link   -> /admin
|   |-- styles/
|   |   `-- global.css           # all application styling
|   |-- App.js                   # route table
|   |-- index.js                 # React entry point
|   |-- firebase.js              # Firebase init, exports { auth, db }
|   |-- App.css / index.css / logo.svg / App.test.js
|   `-- reportWebVitals.js / setupTests.js
|-- firebase.json                # Firestore rules + indexes binding
|-- .firebaserc                  # default Firebase project (graegonx)
|-- firestore.rules              # authorization rules (source of truth)
|-- firestore.indexes.json       # composite index definitions
|-- skills-lock.json             # pinned agent-skill hashes
`-- package.json                 # scripts + dependencies
```

### Routes

| Path                  | Component     | Access                 |
| --------------------- | ------------- | ---------------------- |
| `/`                   | `Login`       | public                 |
| `/join/:inviteCode`   | `JoinGroup`   | signed-in to continue  |
| `/waiting`            | `Waiting`     | authenticated, pending |
| `/chat`               | `Chat`        | `status === "approved"` or admin |
| `/admin`              | `AdminPanel`  | `role === "admin"`     |

### Firestore collections

| Collection    | Document ID | Purpose                                            |
| ------------- | ----------- | -------------------------------------------------- |
| `users`       | auth UID    | profile, `role` (`user`/`admin`), `status` (`pending`/`approved`/`rejected`) |
| `messages`    | auto        | chat messages, `seenBy[]`, `reactions{}`           |
| `presence`    | auth UID    | online flag + `lastActive` (5-minute window)       |
| `typing`      | auth UID    | `isTyping` flag driving the typing indicator       |
| `group`       | `main`      | current `inviteCode`                               |

---

## Scripts

| Command                    | What it does                                  |
| -------------------------- | --------------------------------------------- |
| `npm start`                | dev server with hot reload on `:3000`         |
| `npm run build`            | production bundle into `build/`               |
| `npm test`                 | Jest via `react-scripts test` (watch mode)    |
| `npm run predeploy`        | hook: runs `npm run build` before `deploy`    |
| `npm run deploy`           | legacy manual deploy (`gh-pages -d build`) - prefer CI |

---

## Documentation map

| File                    | Read it when you need to...                                    |
| ----------------------- | -------------------------------------------------------------- |
| [README.md](README.md)  | understand the project in 5 minutes (this file)                |
| [development.md](development.md) | set up locally, understand architecture, write code    |
| [deployment.md](deployment.md)   | ship to production, configure Pages/CI, roll back       |
| [features.md](features.md)       | see every feature, its status and owning file           |
| [pendingworks.md](pendingworks.md) | pick up the backlog (bugs, security, missing features) |
| [scale.md](scale.md)     | plan for many users / multi-room growth                        |
| [AGENTS.md](AGENTS.md)   | **agents read this first** - collaboration contract          |

---

## Security model at a glance

- Client Firebase config is public by design; **authorization lives in
  `firestore.rules`**, never in the UI.
- Reads of chat data require an approved (`status`) or admin user.
- Message creation is validated server-side (type, length <= 1000, sender
  identity).
- Only admins can delete messages and manage users/invite codes.
- Known gaps (unrestricted message edits, unbounded queries, client-only rate
  control) are tracked in [pendingworks.md](pendingworks.md) under **P0/P1**.
  Read them before shipping security-sensitive changes.

---

## License

Private / unlicensed unless stated otherwise. Copyright (c) TROJAN-XX.
