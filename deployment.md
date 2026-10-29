# Deployment Guide

How Graegon gets from a commit to production, how to configure it, and how to
roll it back.

---

## 1. Target architecture

```text
   push to `master`
         │
         ▼
 GitHub Actions  (.github/workflows/deploy.yaml)
   ┌──────────────┬──────────────┬───────────────────────────────┐
   │ 1. build     │ 2. test      │ 3. deploy                     │
   │  npm ci      │  npm test    │  peaceiris/actions-gh-pages   │
   │  npm run     │  --watchAll  │  publishes ./build            │
   │  build       │  =false      │  to branch `gh-pages`         │
   └──────────────┴──────────────┴───────────────┬───────────────┘
                                                 ▼
                            GitHub Pages  (branch: gh-pages)
                            https://TROJAN-XX.github.io/graegon
                                                 │
                                                 ▼
                            Browser -> Firebase Auth / Firestore
                            (enforced by firestore.rules)
```

- The **site** is static (CRA bundle) on GitHub Pages - no server, no SSR.
- The **backend** is Firebase and is deployed separately from
  `firestore.rules` / `firestore.indexes.json`.
- Build output (`build/`) is produced by CI and is **not** tracked in git.

**Why HashRouter matters here:** GitHub Pages has no SPA rewrite rules, so the
app must use `/#/chat` style URLs. If you ever migrate to Firebase Hosting,
you can switch to `BrowserRouter` with a `404.html -> index.html` rewrite (see
[section 6](#6-alternative-firebase-hosting)).

---

## 2. One-time repository setup

| # | Setting | Where | Value |
| - | ------- | ----- | ----- |
| 1 | Pages source | Settings -> Pages -> Build and deployment | **Deploy from a branch**, branch `gh-pages`, folder `/ (root)` |
| 2 | Workflow token | Settings -> Actions -> General -> Workflow permissions | **Read and write permissions** (the deploy job pushes a branch) |
| 3 | Actions allowed | Settings -> Actions -> General -> Actions permissions | Allow "GitHub Actions" and required actions |
| 4 | Branch protection (recommended) | Settings -> Branches -> `master` | Require PR + status checks before merge |
| 5 | Node version | `deploy.yaml` `node-version` | `20` (change here if the project upgrades Node) |

No repository secrets are required for the frontend deploy: `GITHUB_TOKEN` is
issued automatically.

**Secrets/variables table**

| Name            | Type     | Used by                    | Required now? |
| --------------- | -------- | -------------------------- | ------------- |
| `GITHUB_TOKEN`  | automatic| `deploy.yaml` deploy job   | yes (auto)    |
| `FIREBASE_TOKEN`| secret   | optional rules deploy step | no            |
| `GOOGLE_APPLICATION_CREDENTIALS` | secret (JSON) | Firebase deploy from CI | no     |

---

## 3. The workflow file

Location: [`.github/workflows/deploy.yaml`](.github/workflows/deploy.yaml)

| Job     | Runs on            | Purpose                                            | Gate |
| ------- | ------------------ | -------------------------------------------------- | ---- |
| `build` | `ubuntu-latest`    | `npm ci` + `npm run build`, uploads `build` artifact | must pass |
| `test`  | `ubuntu-latest`    | `npm test -- --watchAll=false --ci`                 | must pass |
| `deploy`| `ubuntu-latest`, `master` only | pushes `build/` to `gh-pages`             | after build+test |

Behaviour details:

- **Triggers:** every push to `master`, plus manual `workflow_dispatch`.
- **Concurrency:** `deploy-<ref>` with `cancel-in-progress: true` - a rapid
  second push cancels the older, half-finished deploy (last push wins).
- **`CI: "false"` on the build step** keeps CRA from turning ESLint *warnings*
  into build failures; real errors still fail the job.
- **`force_orphan: true`** keeps the `gh-pages` branch to a single commit so
  the repository history stays small.
- Artifact retention is 7 days.

### Instant-deploy rules of thumb

1. Small, frequent commits to `master` = fastest, safest deploys.
2. Never push directly to `master` for risky changes - open a PR, let the
   checks run (see [pendingworks.md](pendingworks.md#ci-gaps) for the missing
   PR validation workflow).
3. Need a deploy right now without a push? Actions -> **Deploy** -> **Run
   workflow**.

---

## 4. Manual / emergency deploy

```bash
npm ci
npm run build          # writes build/
npx gh-pages -d build  # legacy path, same result as the CI job
```

`npm run deploy` (which runs `predeploy` -> `build` -> `gh-pages`) still works
locally and is the fastest escape hatch if Actions is unavailable. It requires
push access to the repository.

---

## 5. Deploying Firestore rules and indexes

Rules are **not** shipped by `deploy.yaml`. Deploy them deliberately:

```bash
firebase login
firebase deploy --only firestore:rules,firestore:indexes
```

Notes:

- `.firebaserc` pins the default project to `graegonx`. Always confirm with
  `firebase projects:list` before deploying.
- Rules changes take effect immediately for all clients - review
  [development.md §5](development.md#5-security-rules-workflow) first.
- Recommended: add a `workflow_dispatch` + `push: paths: [firestore.rules]`
  job that runs `firebase deploy --only firestore` with a service-account
  secret. Tracked in [pendingworks.md](pendingworks.md#ci-gaps).

---

## 6. Alternative: Firebase Hosting

If you outgrow GitHub Pages (custom domain, SPA rewrites, CDN headers, App
Check friendly domain allowlist), switch like this:

```jsonc
// firebase.json (add)
{
  "hosting": {
    "public": "build",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }],
    "headers": [
      { "source": "**/*.@(js|css|woff2)", "headers": [{ "key": "Cache-Control", "value": "public,max-age=31536000,immutable" }] },
      { "source": "/index.html", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] }
    ]
  }
}
```

```bash
npm run build
firebase deploy --only hosting
```

Then either keep `deploy.yaml` and replace the publish step with
`FirebaseExtended/action-hosting-deploy`, or run the command above locally.
Remember to update `homepage` in `package.json` to the Hosting URL and to add
that domain to Firebase Auth authorized domains.

---

## 7. Rollback

| Situation | Fix |
| --------- | --- |
| Bad deploy, need previous site fast | Actions -> **Deploy** -> find last green run -> **Re-run all jobs** (it rebuilds that exact commit), or `git revert` and push to `master` |
| Need a specific old build, no CI | `git checkout <known-good-sha> && npm ci && npm run deploy` |
| `gh-pages` corrupted | `git push origin --delete gh-pages`, then re-run the workflow from `master` |
| Bad Firestore rules | `git checkout <known-good-sha> -- firestore.rules && firebase deploy --only firestore:rules` |

Cache note: `index.html` is served with default (short) caching; if a stale
bundle shows up, hard-refresh. Immutable asset filenames (`main.<hash>.js`)
prevent long-term poisoning.

---

## 8. Post-deploy verification checklist

- [ ] Workflow run is green (build, test, deploy jobs).
- [ ] https://TROJAN-XX.github.io/graegon loads with a **new** asset hash
      (DevTools -> Sources, or `build/asset-manifest.json` in the artifact).
- [ ] Register a fresh account -> lands on `/waiting`.
- [ ] Admin approves it from `/#/admin` -> user reaches `/#/chat`.
- [ ] Message send, reaction, seen status, typing indicator work.
- [ ] Invite link `/#/join/<code>` works after **Regenerate Link**.
- [ ] Old invite code now fails (regeneration invalidates the previous code).
- [ ] Firebase console shows no `permission-denied` spam in Firestore logs.

---

## 9. Environments

| Environment | URL | Updated by | Data store |
| ----------- | --- | ---------- | ---------- |
| Production  | https://TROJAN-XX.github.io/graegon | push to `master` | Firestore `graegonx` (`asia-south1`) |
| Local       | http://localhost:3000 | `npm start` | same project by default - **use the emulator for experiments** (`firebase emulators:start`) |

There is no separate staging project today. Creating one (`graegonx-staging`)
plus an `envs` mapping in `.firebaserc` is listed in
[scale.md](scale.md#12-environments-and-release-strategy).
