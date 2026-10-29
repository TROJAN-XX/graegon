# Scaling Graegon

How the app behaves today under load, what breaks first, and the staged plan to
serve many more users while building out functionality. Pair with
[pendingworks.md](pendingworks.md) (the actionable backlog) and
[features.md](features.md) (what exists now).

---

## 0. Where we are

| Dimension | Today |
| --------- | ----- |
| Topology | one global room (`messages`), all members equal |
| Clients per listener | every client subscribes to **all** messages, **all** presence docs, **all** typing docs |
| Backend | none - browser talks to Firestore directly, `firestore.rules` is the only server logic |
| Delivery | static bundle on GitHub Pages, Firebase fully managed |
| Practical ceiling | **~50-100 concurrent users and ~10k messages** before the design itself (not the tooling) becomes the problem |

Nothing in the current design is *wrong* for a small private group - it is the
classic Firestore chat pattern. The ceiling comes from four architectural
choices, each addressed below: unbounded queries, per-message read receipts,
full-collection listeners, and a single global room.

---

## 1. What breaks first (ordered by pain)

| # | Bottleneck | Trigger symptom | Fix section |
| - | ---------- | --------------- | ----------- |
| 1 | **Full history download** (`orderBy asc`, no `limit`) | slow first paint, rising read costs, memory growth | [§3 Pagination](#3-pagination) |
| 2 | **`seenBy` write amplification** | `RESOURCE_EXHAUSTED` / write-rate spikes the moment several people open the chat | [§4 Write amplification](#4-write-amplification) |
| 3 | **`presence` + `typing` full-collection listeners** | every client re-renders on every heartbeat of every user | [§5 Presence and typing](#5-presence-and-typing) |
| 4 | **One global room** | interleaved unrelated conversation, no way to scale beyond one audience | [§7 Rooms and membership](#7-rooms-and-membership) |
| 5 | **Client-side admin operations** (`clearChat`, mass deletes) | timeouts past a few thousand messages | [§9 Backend evolution](#9-backend-evolution-cloud-functions) |
| 6 | **No rate limiting / App Check** | spam, scripted abuse | [§10 Abuse and rate limiting](#10-abuse-and-rate-limiting) |

### Read/write math (why 1 and 2 matter)

For `R` readers, `S` senders and a history of `M` messages, opening the chat
once costs roughly:

```text
reads   = M  (messages)  +  P (presence docs)  +  T (typing docs)      per client
writes  = M  (seenBy)    +  R (presence heartbeats / minute)           per full load
```

With `M = 5,000`, `R = 20`: one refresh produces **5,000 reads + 5,000 writes**
from a single user. Firestore's Spark tier is in the tens of thousands of
operations **per day** - so this is both a latency problem and a billing
problem. Verify current quotas/pricing in the Firebase console; the numbers
above are for order-of-magnitude reasoning only.

---

## 2. Target architecture (evolutionary, not a rewrite)

```text
Phase 1 (weeks)   browser  ->  Firestore        + rules        [same shape, bounded]
Phase 2 (months)  browser  ->  Firestore (rooms, cursors, RTDB presence/typing)
                               + Cloud Functions (validation, cleanup, fan-out, FCM)
Phase 3 (scale)   browser  ->  API tier (Cloud Run) + Firestore/AlloyDB
                               + search service + media CDN + observability
```

Each phase keeps the existing data model as a subset, so migration is
per-collection and reversible.

---

## 3. Pagination

**Problem:** `query(collection(db,"messages"), orderBy("createdAt","asc"))`
fetches everything.

**Target design:**

```js
const PAGE = 50;
const first = query(
  collection(db, "messages"),
  orderBy("createdAt", "desc"),
  limit(PAGE),
);                                   // newest page first
// older pages: startAfter(lastVisible)
// render reversed; "Load earlier messages" button prepends
```

- Keep `orderBy("createdAt")` - it already has an automatic single-field index.
  Composite index only appears if you add `where(roomId == ...)` alongside it
  (see [§11](#11-firestore-indexes)).
- Virtualize the list (e.g. `react-window`) once a page set exceeds a few
  hundred rows - DOM nodes dominate scroll cost before Firestore does.
- Cache the newest page in memory; only re-subscribe to the live tail
  (`limit` + `startAfter` for history, a separate `where(createdAt > newest)`
  listener for realtime) so a live chat does not rescan history on every message.

---

## 4. Write amplification

**Problem:** receipts are stored *inside each message* (`seenBy: [uid,...]`).
Every reader writes to every message, and rules allow any approved user to
update any message (see [P0-1](pendingworks.md#p0-security-and-data-integrity)).

**Target design: cursor-based receipts**

```text
receipts/{uid}                 ->  { lastReadAt: ts, lastReadMsgId: id }     (per user, global)
receipts/{uid}/rooms/{roomId}  ->  { lastReadAt: ts }                        (per room, later)

"Seen by N" = count of receipts/{uid}.lastReadAt > message.createdAt
            = a single count query, or a denormalized `seenCount` maintained
              by a Cloud Function if the number of members grows large.
```

Effect: `M` writes per load become `1` write per user per session
(and a few on scroll). Rules become stricter: a user may only write *their own*
receipt doc - no field-level patching of shared messages at all.

Migration: keep `seenBy` readable for old messages (read both during the
transition), stop writing it once the UI reads receipts.

---

## 5. Presence and typing

**Problem:** everyone listens to the whole `presence` and `typing`
collections; heartbeats are 1/min/user plus activity debounces.

**Options (in order of preference for this app):**

1. **Keep Firestore, shard the topic:** one doc per room
   `presence/{roomId}` holding `{ members: { uid: {name, at} } }` - one doc
   read instead of P docs, one write per user per minute. Rotate members out
   client-side after 5 minutes.
2. **Move presence/typing to Realtime Database** where `onDisconnect()` gives
   true online/offline for free (Firestore's web SDK has no `onDisconnect`).
   Typing becomes `typing/{roomId}/{uid}` with an expiry timestamp.
3. **Derive instead of store:** compute "online" from recent receipts/typing
   writes - zero extra documents, slightly less accurate.

Also add TTL/expiry so a crashed tab cannot pin a user as "typing" forever
(Firestore TTL policies, or client-side `updatedAt > now - 6s` filtering).

---

## 6. Cost controls

| Lever | Action |
| ----- | ------ |
| Document size | cap messages at 1,000 chars (already in rules) - store text, never blobs |
| Storage growth | archive rooms older than N days to a cold collection; delete-on-clear should be batched |
| Reads | pagination (§3) + single-doc receipts (§4) + presence sharding (§5) |
| Writes | remove `seenBy` writes; debounce heartbeats to 30-60s |
| Deletes | `clearChat` becomes a Cloud Function batch loop (§9) |
| Plan | watch the console billing alerts; set a budget alert at 50% of the free tier |

Estimated steady state after Phase 1, 100 active users, 50 messages/day:
~2,000 reads/day + ~300 writes/day - comfortably inside the free tier.

---

## 7. Rooms and membership

**Problem:** one global `messages` collection means every future feature
(DM, announcements, topic groups) fights over the same namespace.

**Target model (Phase 2):**

```text
rooms/{roomId}                 { name, type: "public"|"private"|"dm", createdAt, memberCount }
rooms/{roomId}/messages/{id}   (unchanged message shape + roomId removed)
rooms/{roomId}/members/{uid}   { role: "owner"|"moderator"|"member", joinedAt }
users/{uid}/memberships/{roomId}  -> reverse index for the room list
invites/{code}                 { roomId, expiresAt, oneTime, createdBy }   (replaces group/main)
```

- Reads/writes scoped by `roomId` keep every query a `limit()`-sized page.
- Rules become room-aware: `exists(/databases/$(database)/documents/rooms/$(roomId)/members/$(request.auth.uid))`.
- Fan-out for global announcements stays a single `rooms/announcements` doc.
- Migration: new messages write to `rooms/main/messages`; keep reading the flat
  `messages` collection for history until it is backfilled or archived.

---

## 8. Firestore indexes

`firestore.indexes.json` is empty today. Planned additions:

| Query | Index |
| ----- | ----- |
| `messages where roomId == X orderBy createdAt desc` | composite: `roomId (asc) + createdAt (desc)` |
| `messages where roomId == X and senderId == Y` | composite: `roomId + senderId + createdAt` |
| `rooms where type == public orderBy memberCount desc` | composite: `type + memberCount` |
| `members where role == moderator` | composite: `role + joinedAt` |

Rule of thumb: every `where` + `orderBy` pair needs a composite index - the
browser console prints a direct link to create it when a query fails. Commit the
resulting `firestore.indexes.json`; deploy with
`firebase deploy --only firestore:indexes` ([deployment.md §5](deployment.md#5-deploying-firestore-rules-and-indexes)).

---

## 9. Backend evolution (Cloud Functions)

Promote logic out of the browser when it must be *guaranteed*, not just
*hidden*:

| Function | Trigger | Purpose |
| -------- | ------- | ------- |
| `validateMessage` | `onCreate(messages)` | server-side length/spam checks, sanitize, stamp `senderName` from `users` (never trust the client) |
| `cleanupTyping` | scheduled (1 min) | expire stale typing docs |
| `expireInvites` | scheduled | rotate/expire invite codes |
| `clearRoom` | callable | batched delete with Admin SDK (fixes [P1-3](pendingworks.md)) |
| `onUserApproved` | `onUpdate(users)` | send FCM welcome/push, write audit log |
| `onMessageCreate` | `onCreate(messages)` | fan-out push notifications to subscribed members |
| `aggregateReactions` | `onUpdate(messages)` | maintain counts to avoid reading full reaction maps |

Deployment target: keep rules + functions deployable from CI with a service
account secret ([pendingworks.md CI-2](pendingworks.md#ci-gaps)).

**When to leave Firestore entirely:** sustained >1k concurrent writers in one
room, or need for sub-100ms fan-out - move the *transport* to a WebSocket
service (Cloud Run / Firebase RTDB) while Firestore stays the durable store.

---

## 10. Abuse and rate limiting

| Layer | Control |
| ----- | ------- |
| Client | disable Send when empty/over-length; debounce typing writes (exists) |
| Platform | **App Check** (reCAPTCHA Enterprise) - blocks scripted calls with stolen config ([P0-6](pendingworks.md#p0-security-and-data-integrity)) |
| Rules | field-level diffs only (P0-1, P0-5); no `delete` for non-admins |
| Functions | per-UID token bucket: max N messages/minute, max M invites/day |
| Admin | per-user mute/timeout (`users/{uid}.mutedUntil`), report button, audit log |
| Invite | single-use, expiring codes with crypto randomness (P0-4) |

---

## 11. Frontend performance at scale

- **Code-split** pages with `React.lazy` + `Suspense` (Chat is the heavy one);
  Firebase modular SDK already tree-shakes by product import.
- **Memoize** the message list (`React.memo` message row, keyed virtualization)
  so a presence heartbeat does not re-render 5,000 rows.
- **React 19 transitions** for search filtering to keep the input responsive.
- **Static assets**: GitHub Pages serves hashed assets; add
  `Cache-Control: immutable` via Firebase Hosting if you migrate
  ([deployment.md §6](deployment.md#6-alternative-firebase-hosting)).
- **CDN**: images/media (future) go to Firebase Storage + a CDN, never inline
  in Firestore documents (1 MiB doc limit).
- **Measure**: `web-vitals` is already a dependency but reports nowhere -
  wire it to Analytics/BigQuery before optimizing blind ([P2-8](pendingworks.md#p2-code-quality-and-ux)).

---

## 12. Environments and release strategy

| Stage | Firebase project | Content | Gate |
| ----- | ---------------- | ------- | ---- |
| Local | emulators (`firebase emulators:start`) | seeded data | tests |
| Staging | `graegonx-staging` | copy of rules, small seed set | PR checks ([CI-1](pendingworks.md#ci-gaps)) |
| Production | `graegonx` | real data | manual approval + green pipeline |

- Add `envs` to `.firebaserc` and drive `homepage`/config per environment once
  [P1-8](pendingworks.md) lands.
- Frontend releases: immutable (hashed assets) → deploy is instant and safe;
  keep the previous `gh-pages` commit for one-click rollback
  ([deployment.md §7](deployment.md#7-rollback)).
- Rules/function releases: separate, reviewed, always with a backup of the
  previous rules (`firestore.rules` in git is the backup).

---

## 13. Observability

1. **Client:** Crashlytics + Performance Monitoring (or Sentry) - today a
   production error is invisible unless a user reports it.
2. **Backend:** Firestore usage dashboard (reads/writes/errors), budget alerts.
3. **Product:** log key funnels (register -> approved -> first message) to
   BigQuery via Analytics for conversion insight.
4. **SLOs to define early:** message send success rate (>99.9%), time-to-first-
   paint on `/chat` (<2s on 4G), listener reconnect time (<5s).

---

## 14. Product growth roadmap (functionality to build)

Ordered by user value per unit of effort; each entry maps to a scaling phase.

| Stage | Build | Unlocks | Depends on |
| ----- | ----- | ------- | ---------- |
| A | Fix P0s, pagination, receipts ([pendingworks.md](pendingworks.md)) | trust + headroom | - |
| B | Rich messages: edit-with-timestamp, delete-for-everyone, replies/threads, emoji picker with counts | everyday usability | strict message rules |
| C | Media: image/file attachments (Firebase Storage + virus-scan rule), lightbox viewer | engagement | storage rules, CDN (§11) |
| D | Push notifications (FCM + function fan-out), unread badges from receipts | retention | §4, §9 |
| E | Multiple rooms + DMs + roles (`owner`/`moderator`/`member`) | multi-topic groups | §7 |
| F | Profiles: avatars, status, display-name history, member directory | identity | profile docs, moderation |
| G | Search (server-side: Typesense/Algolia or token-index) + message reports/moderation queue | discoverability + safety | §3, §10 |
| H | Admin analytics (active users, message volume, approval funnel), audit log | operator control | §9, §13 |
| I | PWA install, offline compose queue, service worker | mobile reach | §11 |
| J | Multi-tenant workspaces (teams/orgs with isolated data) | B2B | §7 (org scoping in every rule) |
| K | Custom domain + Firebase Hosting + App Check enforcement | production polish | [deployment.md §6](deployment.md#6-alternative-firebase-hosting) |

---

## 15. Capacity test plan

Before each phase transition, measure rather than guess:

1. **Seed:** script 10k messages + 500 users (Admin SDK, staging project).
2. **Load:** k6/Artillery hitting a Cloud Run probe is irrelevant here - instead
   measure *client* work: cold-load `/chat` with 10k docs, record time-to-
   interactive and bytes transferred (DevTools network + Performance).
3. **Write pressure:** open N browser sessions (Puppeteer), assert no
   `RESOURCE_EXHAUSTED` in the console and stable presence rendering.
4. **Rules:** run the rules suite (P0-7) under emulator with adversarial cases.
5. **Budget:** export Firestore usage for the test day and extrapolate to the
   target MAU.

Exit criteria for Phase 1: cold load < 2.5s and < 500 kB transferred with 10k
messages in history, and steady-state writes < 100/min for 50 concurrent users.
