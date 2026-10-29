# Features

Complete inventory of what Graegon does today, where each feature lives, and
what is *not* there yet. Status legend:

- **Done** - works end to end for users.
- **Partial** - works, but with a known limitation (linked to a backlog item).
- **Planned** - described, not built (see [pendingworks.md](pendingworks.md)).

---

## 1. Authentication & access control

| Feature | Status | Owning file(s) | Notes |
| ------- | ------ | -------------- | ----- |
| Email + password sign-up | Done | `src/pages/Login.jsx` | creates `users/{uid}` with `role: "user"`, `status: "pending"` |
| Email + password sign-in | Done | `src/pages/Login.jsx` | routes by role/status after sign-in |
| Login <-> register toggle UI | Done | `src/pages/Login.jsx` | "Request access" / "Login" switch |
| Session persistence | Done | `src/firebase.js`, `ProtectedRoute.jsx` | Firebase Auth local persistence |
| Route guarding by auth + role | Done | `src/components/ProtectedRoute.jsx` | loading spinner -> redirect |
| Secondary guard inside chat | Done | `src/pages/Chat.jsx` (auth effect) | protects against direct deep links |
| Admin-only route (`/admin`) | Done | `src/App.js`, `ProtectedRoute.jsx` | `adminOnly` prop |
| Waiting room for pending users | Done | `src/pages/Waiting.jsx` | shown until admin approval |
| Invite-code gate (`/join/:code`) | Done | `src/pages/JoinGroup.jsx` | compares against `group/main.inviteCode` |
| Invite fallback code | **Partial** | `src/pages/JoinGroup.jsx` | hard-coded `graegon-private` used when `group/main` is missing - remove it ([P0](pendingworks.md#p0-security-and-data-integrity)) |
| Sign-out with presence/typing cleanup | Done | `Chat.jsx` `handleLogout`, `Waiting.jsx`, `AdminPanel.jsx` | sets `online: false`, `isTyping: false` |
| Session expiry / token refresh handling | Planned | - | relies on SDK defaults |
| Password reset email | Planned | - | not wired |
| Provider login (Google/Apple) | Planned | - | not wired |

## 2. Membership & admin approval

| Feature | Status | Owning file(s) | Notes |
| ------- | ------ | -------------- | ----- |
| Access request queue (all users list) | Done | `src/pages/AdminPanel.jsx` | live `onSnapshot`, ordered by `createdAt desc` |
| Approve user | Done | `AdminPanel.jsx` `updateUserStatus` | sets `status: "approved"` |
| Reject user | Done | `AdminPanel.jsx` | sets `status: "rejected"` |
| Revoke approval | Done | `AdminPanel.jsx` | back to `status: "pending"` |
| Status badge colors | Done | `src/styles/global.css` (`.pending/.approved/.rejected`) | |
| Verified admin tick | Done | `AdminPanel.jsx`, `Chat.jsx` | rendered from `role === "admin"` |
| Invite link generation + copy | Done | `AdminPanel.jsx` | `Math.random` code, clipboard copy |
| Invite link regeneration (rotates code) | Done | `AdminPanel.jsx` | invalidates previous link |
| Invite URL with correct base path on GH Pages | Done | `AdminPanel.jsx` | uses `origin + PUBLIC_URL + /#/join/...` |
| Admin bootstrap (first admin) | **Partial** | - | manual console edit ([development.md §9](development.md#9-bootstrap-the-first-admin)) |
| User removal / account deletion | Planned | - | rules allow admin delete, no UI |
| Per-user roles beyond admin/user | Planned | - | rules assume only two roles |
| Audit log of admin actions | Planned | - | |

## 3. Messaging core

| Feature | Status | Owning file(s) | Notes |
| ------- | ------ | -------------- | ----- |
| Send text message | Done | `src/pages/Chat.jsx` `sendMessage` | `addDoc` with server timestamp |
| Real-time receive | Done | `Chat.jsx` messages listener | `onSnapshot` + `orderBy(createdAt asc)` |
| Own vs. others message styling | Done | `.message.own` in `global.css` | |
| Message timestamps (hh:mm) | Done | `Chat.jsx` `message-bottom` | falls back to `""` while timestamp is pending |
| Read receipts: "Delivered" / "Seen by N" | Done | `Chat.jsx` `getSeenText` | `seenBy` array of UIDs |
| Auto-scroll to newest message | Done | `Chat.jsx` `messagesEndRef` | scrolls on every `filteredMessages` change |
| Message search (client-side filter) | Done | `Chat.jsx` `filteredMessages` (`useMemo`) | substring, case-insensitive, searches loaded messages only |
| Search empty state | Done | `.no-results` | |
| Delete single message (admin) | Done | `Chat.jsx` `deleteMessage` | `window.confirm` first |
| Clear entire chat (admin) | Done | `Chat.jsx` `clearChat` | fetches all docs then deletes in parallel - unbounded ([P1](pendingworks.md#p1-correctness-performance-and-scale)) |
| Message length validation | **Partial** | `firestore.rules` only (<=1000) | no client-side counter/hint |
| Message pagination | Planned | - | the full history is loaded for every client ([scale.md](scale.md#3-pagination)) |
| Edit message | Planned | - | **rules currently allow it for any approved user - close this hole** ([P0](pendingworks.md#p0-security-and-data-integrity)) |
| Attachments / images / files | Planned | - | no Firebase Storage usage yet |
| Reply / thread / quote | Planned | - | |
| Direct messages or multiple rooms | Planned | - | single global `messages` collection |
| Soft delete (tombstone) | Planned | - | messages are hard-deleted |
| Offline send queue / retries | Planned | - | Firestore offline persistence is default but untested in-app |

## 4. Reactions

| Feature | Status | Owning file(s) | Notes |
| ------- | ------ | -------------- | ----- |
| Emoji picker dropdown (6 emojis) | Done | `Chat.jsx` reaction dropdown | 👍 ❤️ 😂 😮 😢 🙏 |
| Toggle own reaction on/off | Done | `Chat.jsx` `toggleReaction` | writes full array to `reactions.<emoji>` |
| Top reaction chip with count | Done | `Chat.jsx` `getTopReaction` | first emoji with the highest count |
| Close picker after choosing | Done | `Chat.jsx` (`setOpenReactionId(null)`) | |
| Per-user reaction de-duplication | Done | `toggleReaction` | filters own UID out before re-adding |
| Reaction picker open state across messages | **Partial** | `openReactionId` single value | only one picker open at a time (intended) |
| Reaction summary of *all* emojis | Planned | - | only the top one is shown |
| Server-side reaction validation | Planned | - | rules only require `reactions` to be a map |

## 5. Presence & typing

| Feature | Status | Owning file(s) | Notes |
| ------- | ------ | -------------- | ----- |
| Online list in chat header | Done | `Chat.jsx` `onlineUsers` | `presence` snapshot filtered to 5 minutes |
| "N online" counter | Done | `Chat.jsx` header | |
| Presence heartbeat (60s) | Done | `Chat.jsx` `updateActivity` | |
| Activity-debounced heartbeat (1s) | Done | `Chat.jsx` `debouncedUpdateActivity` | mousemove/keydown/click/touchstart |
| Hard offline on logout | Done | `Chat.jsx` `handleLogout` | `online: false` |
| Tab close / crash leaves stale presence | **Partial** | - | no `beforeunload`/`pagehide` writer - appears online up to 5 min ([P1](pendingworks.md#p1-correctness-performance-and-scale)) |
| Typing indicator ("X is typing...") | Done | `Chat.jsx` `handleTyping` + `.typing-indicator` | `typing/{uid}` doc, `where isTyping == true` |
| Shows only the first typist | **Partial** | `Chat.jsx` | `typingUsers[0].name` only |
| Auto-clear stuck typing docs | Planned | - | a crashed tab leaves `isTyping: true` until next write |
| Last-seen timestamps | **Partial** | `presence.lastSeen` written, never displayed | |

## 6. Admin panel

| Feature | Status | Owning file(s) | Notes |
| ------- | ------ | -------------- | ----- |
| Admin dashboard page | Done | `src/pages/AdminPanel.jsx` | `/#/admin` |
| Jump to chat from admin | Done | `AdminPanel.jsx` header button | |
| Mobile-friendly layout | Done | `global.css` media queries | recent commit: "mobile version of the admin panel" |
| Invite card (read-only URL + actions) | Done | `AdminPanel.jsx` | copy / regenerate |
| User cards (name, email, status) | Done | `AdminPanel.jsx` | live list |
| Approve / Reject / Revoke buttons | Done | `AdminPanel.jsx` | hidden for admins |
| Empty state ("No users found.") | Done | `AdminPanel.jsx` | |
| `UserRequestCard` component | **Partial** | `src/components/UserRequestCard.jsx` | **file is empty (0 bytes)** - extraction never finished ([P2](pendingworks.md#p2-code-quality-and-ux)) |
| Clear chat / delete message from chat UI | Done | `Chat.jsx` | admin-only buttons |
| Admin stats (counts, activity) | Planned | - | |
| User search / filter in panel | Planned | - | |

## 7. UI / UX

| Feature | Status | Owning file(s) | Notes |
| ------- | ------ | -------------- | ----- |
| Dark modern theme | Done | `src/styles/global.css` | `#0f172a` bg, radial gradient auth screen |
| Auth screen card layout | Done | `.auth-page/.auth-card` | |
| Loading screens | Done | `src/components/LoadingScreen.jsx` | used by `ProtectedRoute` ("Checking access...") |
| Chat loading state | Done | `Chat.jsx` `loading` branch | "Loading Graegon..." |
| Global footer with credit | Done | `src/components/Footer.jsx` | rendered on every route |
| Responsive/mobile chat layout | Done | `global.css` media queries | |
| Verified tick component style | Done | `.verified-tick` | |
| Profile rename modal | Done | `Chat.jsx` `updateProfileName` | updates `users` + `presence` |
| Hidden scrollbars in message list | Done | `.messages::-webkit-scrollbar` | WebKit only |
| Incoming/outgoing message animations | Done | `global.css` keyframes | |
| App favicon/manifest | **Partial** | `public/manifest.json` | still says "Create React App Sample" ([P2](pendingworks.md#p2-code-quality-and-ux)) |
| Page `<title>` / meta description | **Partial** | `public/index.html` | title is "Graegon", description is CRA boilerplate |
| Toast notifications instead of `alert()` | Planned | - | |
| Accessibility pass (focus, aria, contrast) | Planned | - | |
| i18n / multi-language | Planned | - | |
| PWA install + service worker | Planned | - | CRA sw disabled by default |

## 8. Platform, quality & operations

| Feature | Status | Owning file(s) | Notes |
| ------- | ------ | -------------- | ----- |
| Production build | Done | `npm run build` | CRA 5, hashed assets |
| Instant CI/CD deploy | Done | `.github/workflows/deploy.yaml` | build -> test -> `gh-pages` |
| Git ignore hygiene | Done | `.gitignore` | `build/`, `.env*`, logs, editors |
| Automated test suite | **Partial** | `src/App.test.js` | CRA leftover test, does not assert the real app ([P1](pendingworks.md#p1-correctness-performance-and-scale)) |
| Lint on CI | Planned | - | only CRA's default ESLint during build |
| PR validation workflow | Planned | - | deploy runs on `master` push only ([CI gaps](pendingworks.md#ci-gaps)) |
| Firebase rules unit tests | Planned | - | no `@firebase/rules-unit-testing` yet |
| Firebase Hosting / custom domain | Planned | - | see [deployment.md §6](deployment.md#6-alternative-firebase-hosting) |
| Analytics | **Partial** | `measurementId` in `firebase.js` | Firebase Analytics SDK not imported, so nothing is collected |
| Error monitoring (Crashlytics/Sentry) | Planned | - | |
| Rate limiting / spam protection | Planned | - | client-side only ([scale.md](scale.md#10-abuse-and-rate-limiting)) |
| App Check | Planned | - | |

---

## 9. Security features (enforced in `firestore.rules`)

| Control | Status | Detail |
| ------- | ------ | ------ |
| Only signed-in users can read anything | Done | `isSignedIn()` |
| Chat readable only by approved/admin users | Done | `isApproved()` |
| Message creation shape validation | Done | type/text length/sender fields/`seenBy`/`reactions` |
| Sender identity is the authenticated UID | Done | `request.resource.data.senderId == request.auth.uid` |
| Only admins delete messages | Done | `allow delete: if isAdmin()` |
| Users cannot escalate `role` or `status` | Done | self-update must keep `role` and `status` unchanged |
| Only admins manage users & invite codes | Done | `users` update by admin / `group` write by admin |
| Typing & presence docs can only be self-written | Done | `request.auth.uid == userId` |
| Message edit restricted to sender | **Missing** | any approved user can update any message ([P0](pendingworks.md#p0-security-and-data-integrity)) |
| Rate limiting / size quotas | **Missing** | no `request.resource.data.diff()` guards beyond message length |
| Invite code entropy | **Partial** | 8 chars of `Math.random` (not crypto-secure) |
| App Check / domain restriction on Firestore | **Missing** | any web origin with the public config can call Firestore |

---

## 10. Where to change what - quick index

| I want to...                              | Touch                                            |
| ----------------------------------------- | ------------------------------------------------ |
| Add a route / page                        | `src/App.js`, new file in `src/pages/`          |
| Change chat behaviour                     | `src/pages/Chat.jsx`                            |
| Change approval flow                      | `src/pages/AdminPanel.jsx`, `src/pages/Login.jsx` |
| Change styling / theme                    | `src/styles/global.css`                         |
| Add/change a Firestore field              | writer file **and** `firestore.rules` **and** this doc |
| Add a query needing a composite index     | `firestore.indexes.json` + [scale.md](scale.md#11-firestore-indexes) |
| Add an environment variable               | `.env`/`.env.production` + `.env.example`       |
| Ship anything                              | `.github/workflows/deploy.yaml` ([deployment.md](deployment.md)) |
