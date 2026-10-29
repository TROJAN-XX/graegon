# Pending Works

The single source of truth for open work. **Claim an item by adding your handle
and the date next to it before you start** (see
[AGENTS.md §7](AGENTS.md#7-working-side-by-side-with-other-agents)), and move it
to the Done section with a PR link when you finish.

Priority key: **P0** = fix now (security/data loss) - **P1** = next (correctness,
scale) - **P2** = when there is room (quality/UX).

> Last reviewed: 2026-10-28 against `c1673dd`.

---

## P0: Security and data integrity

| ID | Item | Evidence / location | Claimed |
| -- | ---- | ------------------- | ------- |
| P0-1 | **Anyone approved can edit any message.** `messages` has `allow update: if isApproved();` with no field or ownership restriction, so a malicious client can rewrite `text`, `senderName`, `senderRole` or another user's `seenBy`/`reactions`. Restrict updates to: sender may change only `reactions`/`seenBy` for own message; any approved user may only append their own UID to `seenBy`; admins additionally may edit. | `firestore.rules` -> `match /messages` | |
| P0-2 | **Hard-coded invite fallback.** `JoinGroup` accepts `graegon-private` whenever `group/main` is missing, and `AdminPanel` seeds that same value - effectively a permanent backdoor invite. Remove the fallback and require `group/main` to exist (seed it in the console with a random code). | `src/pages/JoinGroup.jsx`, `src/pages/AdminPanel.jsx` | |
| P0-3 | **Invite flow breaks for signed-out visitors.** Rules allow `group` reads only for signed-in users, but `checkInvite()` runs *before* login and has no `try/catch` - a denied read leaves the promise rejected and the screen stuck on "Checking invite...". Fix: wrap in `try/catch`, treat a denial as "ask user to log in first", and route to `/` with a return-to-invite hint. | `src/pages/JoinGroup.jsx` | |
| P0-4 | **Weak invite code generation.** `Math.random().toString(36).substring(2,10)` is predictable and only ~8 chars. Use `crypto.getRandomValues` (16+ chars), store a hash if the code must be secret, and rate-limit attempts. | `src/pages/AdminPanel.jsx` `generateInviteCode` | |
| P0-5 | **Self-service profile updates accept arbitrary fields.** The self-`update` rule re-checks only `role`/`status`, so an approved user could inject extra fields into their own doc (e.g. `isAdmin`-looking flags consumed by future code). Constrain the diff to `name` only. | `firestore.rules` -> `match /users` | |
| P0-6 | **No App Check / no domain restriction.** Anyone holding the public web config can call Firestore directly. Enable App Check (reCAPTCHA Enterprise) + Firebase Auth authorized domains, and consider denying unknown origins. | Firebase console + `src/firebase.js` | |
| P0-7 | **Rules changes are manual and untested.** No `@firebase/rules-unit-testing` suite, no CI guard - a rules typo can lock out all users on the next deploy. Build a rules test suite running on the emulator in CI. | `firestore.rules`, CI | |
| P0-8 | **`presence` allows arbitrary role claims.** Self create/update validates `role in ["admin","user"]` but lets any user *write* `role: "admin"` into their presence doc (display-only today, dangerous once any UI trusts it). Store only `displayName` client-side and derive role from `users/{uid}`. | `firestore.rules` -> `match /presence` | |

---

## P1: Correctness, performance and scale

| ID | Item | Evidence / location | Claimed |
| -- | ---- | ------------------- | ------- |
| P1-1 | **Read receipts cause write amplification.** Every client writes `seenBy: arrayUnion(uid)` to *every* other message it loads; a fresh client with M messages triggers M writes at once and can hit Firestore's write-rate limits. Move to a per-user cursor: `receipts/{uid}.{lastSeenAt}` (or per-room `lastRead`), and compute "Seen by N" from a count query. See [scale.md](scale.md#4-write-amplification). | `src/pages/Chat.jsx` messages effect | |
| P1-2 | **Unbounded message query.** `orderBy(createdAt asc)` with no `limit()` downloads the entire history to every client (and resubscribes whenever `currentUserData` changes). Add `limit(50)` + `startAfter` pagination and a "load older" affordance. | `src/pages/Chat.jsx` | |
| P1-3 | **`clearChat` deletes unbounded docs in parallel.** `Promise.all` over every message document; breaks past a few thousand messages and is slow. Batch 500/write, paginate, or move to a Cloud Function with the Admin SDK. | `src/pages/Chat.jsx` `clearChat` | |
| P1-4 | **Stale presence on tab close/crash.** Nothing writes `online: false` on `pagehide`/`beforeunload`, so a closed tab looks online for the 5-minute window. Add a `pagehide` writer (best effort) and/or move presence to Realtime Database `onDisconnect`. | `src/pages/Chat.jsx` | |
| P1-5 | **Stuck typing indicators.** `isTyping: true` is never cleared if the tab dies; also only the first typist is rendered (`typingUsers[0].name`). Store `updatedAt` (already written) and drop entries older than ~6s client-side; show "A, B and 3 others are typing". | `src/pages/Chat.jsx` | |
| P1-6 | **No catch-all route.** `Routes` has no `path="*"`, so an unknown URL renders a blank page with only the Footer. Add a redirect to `/` (or a 404 screen). | `src/App.js` | |
| P1-7 | **Test suite is a stub.** Only 2 smoke tests. Add: `ProtectedRoute` redirect matrix, `JoinGroup` invite cases, `Chat` search/reaction reducers, rules tests (ties to P0-7). | `src/App.test.js` | |
| P1-8 | **Firebase config is hard-coded.** Move to `REACT_APP_*` env vars + `.env.example` so the app can target staging/emulator projects without editing source. | `src/firebase.js`, `development.md` §2 | |
| P1-9 | **CI gaps:** no PR validation workflow (lint+test on pull_request), no rules-deploy job, no artifact-based GitHub Pages path as an alternative, no dependency review. | `.github/workflows/` | |
| P1-10 | **Bundle is not code-split.** 627 kB raw / 189 kB gzip single `main` chunk (CRA + Firebase + Router). `React.lazy` the pages, drop unused Firebase products, audit `web-vitals`/testing deps from the production path. | `src/App.js`, `package.json` | |
| P1-11 | **Client-side only validation of message length.** Rules cap at 1000 chars but the input gives no counter/feedback - users hit a silent `permission-denied`. Add a 1000-char counter + disable Send when over. | `src/pages/Chat.jsx` | |
| P1-12 | **Duplicate/dead CSS.** `.online-users`, `.messages`, `.verified-tick` etc. are declared 3+ times in `global.css`; selector audit needed to make future styling predictable. | `src/styles/global.css` | |
| P1-13 | **Search is client-side only over loaded messages.** With P1-2 pagination it will silently search less. Plan an index strategy (prefix tokens in-message, or Typesense/Algolia) - see [scale.md](scale.md#14-product-growth-roadmap). | `src/pages/Chat.jsx` | |
| P1-14 | **No error boundary / global error handling.** Any render error drops the user to a white screen. Add an error boundary + `onSnapshot` error surfaces (rules denials are currently only `console.error`). | `src/App.js` | |

---

## P2: Code quality and UX

| ID | Item | Evidence / location | Claimed |
| -- | ---- | ------------------- | ------- |
| P2-1 | **Three component files are empty (0 bytes)** - `MessageInput.jsx`, `MessageList.jsx`, `UserRequestCard.jsx`. Extract the corresponding JSX from `Chat.jsx`/`AdminPanel.jsx` or delete the files. | `src/components/` | |
| P2-2 | **CRA leftovers**: `src/App.css`, `src/logo.svg` are unused; `src/App.test.js` was rewritten (OK); `public/manifest.json` still says "Create React App Sample"; `public/index.html` meta description is boilerplate; `reportWebVitals` is a no-op. Rebrand or remove. | `src/`, `public/` | |
| P2-3 | **`alert()` / `window.confirm()` UX.** Replace with a toast/confirm component (already a `.profile-modal` pattern to reuse). | all pages | |
| P2-4 | **Auth hardening:** no email verification, no password reset, no min-password feedback, raw `error.message` shown to users (leaky). Map Firebase error codes to friendly copy. | `src/pages/Login.jsx` | |
| P2-5 | **Admin has no user search/filter** and no confirmation before approve/reject; accidental approvals are one click away. | `src/pages/AdminPanel.jsx` | |
| P2-6 | **`lastSeen` is written but never displayed**, and only the first typist is shown (see P1-5). | `src/pages/Chat.jsx` | |
| P2-7 | **Accessibility:** no `aria-live` on the message list, no focus management on modals, emoji buttons have no labels, color-only status badges. | `global.css`, pages | |
| P2-8 | **Analytics/observability:** `measurementId` exists but the Analytics SDK is never imported; no Crashlytics/Sentry, no performance monitoring. | `src/firebase.js` | |
| P2-9 | **Mobile polish:** header buttons wrap awkwardly, hidden scrollbars are WebKit-only (`.messages::-webkit-scrollbar`) and hide affordance in Firefox. | `global.css` | |
| P2-10 | **`.env.example` is a template only.** It documents the future `REACT_APP_*` keys, but nothing reads them yet - landing P1-8 (env-driven config) is what makes it real. | repo root | |

---

## CI gaps

| ID | Gap | Fix |
| -- | --- | --- |
| CI-1 | `deploy.yaml` runs on `master` push only - PRs get no checks | add `.github/workflows/ci.yaml` with `on: pull_request` (lint, build, test) and make it a required check |
| CI-2 | Rules/indexes never deployed by CI | optional `workflow_dispatch` job using a service-account secret (`FIREBASE_TOKEN` / `GOOGLE_APPLICATION_CREDENTIALS`) guarded to `firestore.rules` path changes |
| CI-3 | No dependency/audit gate | `npm audit --production --audit-level=high` step (advisory at first) |
| CI-4 | No preview deployments | publish PR builds to a `pr-<n>` path or use Firebase Hosting channels |
| CI-5 | Single Node version pinned (20) | add a small matrix (18/20/22) on PRs only |

---

## Done recently (2026-10-28 documentation pass)

| Item | Change |
| ---- | ------ |
| Repo hygiene | `.gitignore` rewritten (`/build`, `.env*`, Firebase logs, editors); `build/` untracked from git (files kept on disk, still built by CI); `.env.example` template added |
| Instant deploy | `.github/workflows/deploy.yaml`: build -> test -> publish `gh-pages`, concurrency cancel, manual dispatch |
| Broken tests | `App.test.js` replaced with 2 real smoke tests; Jest `moduleNameMapper` for `react-router-dom` v7 (its `main` points at a non-existent `dist/main.js`); `setupTests.js` polyfills `TextEncoder`/`TextDecoder`/`BroadcastChannel` for jsdom |
| Docs | `README.md` rewritten (was mojibake + stale), plus new `development.md`, `deployment.md`, `features.md`, `AGENTS.md`, `scale.md`, `pendingworks.md` |

---

## Suggested order of attack

```text
Week 1   P0-1, P0-2, P0-3, P0-5   (rules + invite fixes, small and high value)
Week 2   P0-7, P1-7, CI-1         (tests + PR checks so nothing regresses)
Week 3   P1-1, P1-2, P1-3         (the performance trio that unblocks growth)
Week 4   P1-4, P1-5, P1-6, P1-14  (correctness polish)
Then     P0-4, P0-6, P1-8, P1-9   (hardening + config)
Ongoing  P2 items, feature work from [scale.md](scale.md#14-product-growth-roadmap)
```
