# Development Guide

Everything you need to work on Graegon locally and keep the codebase healthy.
Read [README.md](README.md) first for the 5-minute overview, and
[AGENTS.md](AGENTS.md) for the collaboration contract.

---

## 1. Prerequisites

| Tool    | Version                        | Why                                   |
| ------- | ------------------------------ | ------------------------------------- |
| Node.js | 18+ (CI uses 20)               | `react-scripts` 5 compatibility        |
| npm     | 9+                             | lockfile v3 (`package-lock.json`)     |
| Git     | 2.x                            | branching/PR flow                     |
| Firebase CLI (optional) | 13+ | rules/index deploys, emulators |
| A Firebase project       | -   | `graegonx` by default (see `.firebaserc`) |

```bash
git clone https://github.com/TROJAN-XX/graegon.git
cd graegon
npm ci          # never use `npm install` - it mutates the lockfile
npm start       # http://localhost:3000
```

`npm ci` is the only correct install command. If the lockfile and
`package.json` disagree, fix the dependency deliberately and commit both files.

---

## 2. Environment configuration

Firebase config is currently hard-coded in [`src/firebase.js`](src/firebase.js).
Those values are **public identifiers, not secrets** (Firebase web apps ship
them to every browser); real protection comes from `firestore.rules` + App Check.

Recommended refactor (tracked in [pendingworks.md](pendingworks.md), P1):

```js
// src/firebase.js
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
};
```

| File              | Committed? | Purpose                                  |
| ----------------- | ---------- | ---------------------------------------- |
| `.env`            | **no** (gitignored) | local overrides                  |
| `.env.production` | **no**     | production overrides                     |
| `.env.example`    | yes        | documents every `REACT_APP_*` key        |

CRA only exposes variables prefixed with `REACT_APP_`. Restart `npm start`
after changing any env file. Firebase Auth domain allowlisting must include
`localhost:3000` for local sign-in (Console -> Authentication -> Settings ->
Authorized domains).

---

## 3. Architecture

There is **no backend server**. The React app talks directly to Firebase:

```text
  Login.jsx ──► Firebase Auth ──► users/{uid} doc
                     │
  ProtectedRoute ────┤  reads users/{uid} once per auth change
                     │
  Chat.jsx ──────────┼──► messages  (onSnapshot, orderBy createdAt asc)
                     ├──► presence  (onSnapshot, 5 min online window)
                     ├──► typing    (onSnapshot, where isTyping == true)
                     └──► users     (own doc, display name)
  AdminPanel.jsx ────┼──► users     (onSnapshot, orderBy createdAt desc)
                     └──► group/main (invite code)

  Firestore security rules are the enforcement layer.
```

### Request/response flow for a message

1. `handleTyping` writes `typing/{uid}.isTyping` (debounced by the input).
2. `sendMessage` `addDoc` -> `messages` with `seenBy: [me]`, `reactions: {}`.
3. Every listener receives the new doc; other clients re-render via
   `setMessages`.
4. Each client that is not the sender writes `seenBy: arrayUnion(uid)` — this is
   the read-receipt mechanism, and it is the main write-amplification cost
   (see [scale.md](scale.md#4-write-amplification)).

### Cross-cutting concerns

| Concern            | Where it lives                                   |
| ------------------ | ------------------------------------------------ |
| Auth gate          | `src/components/ProtectedRoute.jsx`              |
| Secondary gate     | `Chat.jsx` auth effect (redirects to `/waiting`) |
| Presence heartbeat | `Chat.jsx` `updateActivity`, 60s interval + user activity debounce |
| Loading states     | `LoadingScreen.jsx`, inline `loading` branches   |
| Styling            | `src/styles/global.css` only (single stylesheet) |

---

## 4. Data model reference

```text
users/{uid}
  name: string            email: string
  role: "user" | "admin"
  status: "pending" | "approved" | "rejected"
  createdAt: timestamp

messages/{autoId}
  type: "text"
  text: string <= 1000 chars
  senderId: uid           senderName: string
  senderRole: "user" | "admin"
  seenBy: string[]        reactions: { [emoji]: string[] }
  createdAt: timestamp

presence/{uid}
  name, role, online: bool, lastActive: timestamp, lastSeen: timestamp

typing/{uid}
  name, isTyping: bool, updatedAt: timestamp

group/main
  inviteCode: string      updatedAt: timestamp
```

Indexes: `firestore.indexes.json` is currently empty; all queries are
single-field (`orderBy createdAt`) or a single equality (`isTyping == true`).
The `users` list uses `orderBy("createdAt", "desc")`, which Firestore serves
with an automatic single-field index. The moment you add a `where` + `orderBy`
combination you must add a composite index (see
[scale.md](scale.md#11-firestore-indexes)).

---

## 5. Security rules workflow

`firestore.rules` is the source of truth for authorization. The UI gates are
convenience only.

```bash
# validate + deploy rules/indexes
firebase deploy --only firestore:rules,firestore:indexes

# local emulation
firebase emulators:start --only firestore,auth
firebase emulators:exec --only firestore "npm test -- --watchAll=false"
```

**Rules change checklist**

1. Update `firestore.rules`.
2. Test against the emulator with `@firebase/rules-unit-testing`.
3. Deploy to a staging/production project deliberately - never from a dirty tree.
4. Record the change in [pendingworks.md](pendingworks.md) and
   [features.md](features.md) (the "Security" rows).

Known rule gaps to close are listed under
[pendingworks.md -> P0](pendingworks.md#p0-security-and-data-integrity).

---

## 6. Coding conventions

**Structure**

- One component per file; page-level screens in `src/pages/`, reusable pieces in
  `src/components/`.
- Keep `src/firebase.js` as the single Firebase entry point; import `{ auth, db }`
  from there and nowhere else.
- Route changes go through `src/App.js` only.

**Style**

- Function components + hooks. No class components.
- Plain CSS in `src/styles/global.css`, class names kebab-case
  (`.message-top`, `.online-dot`). Match the existing dark palette
  (`#0f172a` background, `#38bdf8` accent).
- No new UI dependency (styled-components, Tailwind, MUI) without an ADR in
  [pendingworks.md](pendingworks.md).
- `alert()` / `window.confirm()` are the current UX for errors - keep them
  consistent until a toast system lands (P2).

**Data access**

- Every Firestore call is wrapped in `try/catch` and logs with
  `console.error("...", error)`.
- Long-lived listeners must be returned from `useEffect` cleanup
  (`return () => unsubscribe();`) - this is mandatory, a leaked listener leaks
  money.
- Never write to a collection from more than one place without documenting it;
  `presence` is written by `Chat.jsx` in four places today (see
  [pendingworks.md](pendingworks.md)).

**Git**

- Commit message shape: `<type>: <summary>` where type is
  `feat|fix|docs|chore|refactor|test|ci|perf|security`.
- Keep commits scoped to one concern; do not mix `build/` output with source
  changes (`build/` is gitignored now).
- Update the docs in the same PR as the behavior you change.

---

## 7. Testing

```bash
npm test                       # watch mode
npm test -- --watchAll=false   # single run (what CI runs)
```

- Tests live next to the code (`*.test.js`) and use
  `@testing-library/react` + `setupTests.js`.
- Current state: only `src/App.test.js` exists and it is a **CRA leftover that
  does not reflect the app** - replace it (P1 in
  [pendingworks.md](pendingworks.md)).
- Priority test targets, in order:
  1. `ProtectedRoute` redirect matrix (no user / pending / approved / admin).
  2. `JoinGroup` invite validation (valid, invalid, missing `group/main`).
  3. Rules tests for `messages` and `users` (emulator).
  4. `Chat` message rendering + search filter.

CI runs the suite before every deploy ([deploy.yaml](.github/workflows/deploy.yaml));
a red test blocks the release by design.

---

## 8. Debugging checklist

| Symptom                                   | First things to check                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| Stuck on "Checking access..."             | `users/{uid}` doc exists? `status`/`role` values correct?                    |
| Redirected to `/waiting` after approval   | stale auth state - log out/in; `ProtectedRoute` reads the doc on auth change |
| Messages not loading                      | Firestore rules deny read -> check browser network tab for `permission-denied` |
| "Invalid invite link"                     | `group/main.inviteCode` vs the code in the URL; fallback is `graegon-private` |
| Blank page in production                  | asset paths -> `homepage` in `package.json` must match the Pages URL          |
| Local sign-in failing                     | `localhost:3000` missing from Authorized domains                              |
| Test fails on Firebase init               | run against the emulator or mock `../firebase`                               |

Useful commands:

```bash
npm run build          # verify the production bundle compiles
npx react-scripts --help
npx eslint src --ext .js,.jsx
git log --oneline -20  # recent history / conventions
```

---

## 9. Bootstrap the first admin

There is no admin signup flow. Do it once per Firebase project:

```text
1. Register normally in the app (you become status: pending).
2. Firebase Console -> Firestore -> users -> <your-uid>
3. Set  role: "admin"        (status can stay "pending"; admins bypass it)
4. Reload the app -> Admin Panel appears.
```

Alternative (CLI, requires a signed-in session): use the Admin SDK in a
throwaway Node script - never ship service-account keys in this repo.

---

## 10. Project hygiene rules

1. `build/` is **never** committed (gitignored; CI builds it).
2. No secrets in the repo: no service-account JSON, no `FIREBASE_TOKEN`, no
   personal `.env`.
3. `.agents/skills` is pinned by `skills-lock.json` - re-pin through the skill
   manager, do not hand-edit hashes.
4. Keep this doc truthful: if you change setup, routing, data model or rules,
   update `development.md` in the same PR.
