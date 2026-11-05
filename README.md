<p align="center">
  <img src="docs/app-icon.png" alt="Shagun Register icon: a white श on a sindoor tile, with a marigold ₹ coin on its corner" width="128">
</p>

<h1 align="center">Shagun Register</h1>

A private family ledger for wedding and function gifts: log what you receive and give, work offline at the venue, and look up the full give-and-take history with any family.

React Native (Expo SDK 58) · Node.js + Express · MongoDB · TypeScript throughout.

[Features](#features) · [Run it](#run-it) · [Deploy](#deploy) · [How it works](#how-it-works) · [Testing](#testing) · [Design decisions](#design-decisions) · [History](#history) · [Still open](#still-open)

**Status:** weeks 1–6 are complete, along with demo accounts, ledger controls, account deletion and the release setup. Google sign-in and a real phone are still untested ([details](#still-open)).

## Features

### At the venue

- **Events:** your own function (gifts received) or another family's (gifts given). A wedding, griha pravesh, birthday, mundan or other, with sub-functions such as haldi, sangeet and reception.
- **Quick Entry:** amount chips from ₹101 to ₹5,100, a keypad, payment mode (cash, UPI, cheque or item), relation, and **Save and next**.
- **Offline first:** every save lands on the phone at once and goes up when there's a connection. The sync status shows **✓ ALL SAVED**, **N TO SYNC**, **N ON PHONE** (offline) or **SYNCING…**.
- **Cash count:** compare logged cash with what you counted and see short, over or matches. A checklist of cash entries, largest first, helps find the missing envelope. Every count is kept as a record.
- **Fix an entry:** long-press it on the event screen and choose Edit or Delete.

### Finding people

- **Hindi and English names match:** "Shri Ramesh Sharma ji", "रमेश शर्मा" and "Ramesh Sharmaa" all give the key `ramesh sharm`.
- **Fuzzy search** in Quick Entry, Home, the People tab and the host-family field.
- **Typed names are reused when unambiguous:** "Sunita Mishra" reuses "Smt. Sunita Mishra" when she is the only exact match, and asks you to pick when there are several.
- **City for new people,** so "Ramesh Sharma (Indore)" and "Ramesh Sharma (Bhopal)" stay apart.
- **Contacts:** permission is asked only the first time you tap "Search phone contacts". Contacts stay in memory unless you pick one, and writing to contacts is blocked in `app.json`.
- **Person history:** All / Given / Received filters, "N exchanges since YYYY · last in Mon YYYY", and for an upcoming invite, what they gave you last time plus "Log what you gave".
- **Duplicate merge:**
  - People are suggested when they share a match key and their cities don't conflict (Indore and इंदौर agree), or when they share a 10-digit phone number. Suggestions are never merged automatically.
  - You choose which entry stays. The other's gifts and hosted functions move across, and its city, phone, relation and Hindi spelling fill any blanks.
  - A merge made on one phone reaches the others, including gifts logged offline against the merged person.

### Sharing with family

- **Shared ledgers:** create a ledger (works offline), then share a 6-character invite code. A code stays valid for 48 hours and can be used more than once.
- **Sync between phones:** relatives can log offline at the same wedding and both end up with every gift. A language or role change made elsewhere arrives the next time the app opens.
- **Roles:**

| | Owner | Editor | Viewer |
|---|---|---|---|
| See and export the ledger | ✓ | ✓ | ✓ |
| Log, edit and merge | ✓ | ✓ | |
| Invite, change roles, remove members | ✓ | | |
| Rename, hand over or delete the ledger | ✓ | | |
| Leave the ledger | | ✓ | ✓ |

- **Ledger controls** (More → *Family members*, owner only):
  - **Rename:** other phones pick up the new name the next time the app opens.
  - **Hand over:** the chosen member becomes the owner, and the old owner stays as an editor and can then leave.
  - **Delete:** type the ledger's name to confirm. Every member loses it at once, and the server erases its copy after 30 days.

### Invite cards and exports

- **Scan an invite card:** take a photo, or choose one from the gallery, and the new-event form opens filled in with a note to check it.
  - It finds the type, the date (Hindi or English months, Devanagari digits, dd.mm.yyyy, or no year), the couple or child, the host family, the venue, and a wedding's functions.
  - ML Kit reads Latin and Devanagari on the phone, and the photo isn't uploaded.
- **PDF register** (the share icon on an event): A4, with totals, the split by mode, the latest cash count against cash logged, and every gift grouped by function with subtotals.
- **Excel** (More → *Export to Excel*): Gifts, People and Events sheets, with real dates, amounts as numbers in Indian grouping (12,34,567), frozen headers and filters.
- Both are made from the phone's own database, so they work offline, and viewers can export too.

### Language and privacy

- **Hindi and English:** every screen and message, the Excel columns and the PDF register.
  - Choose on More, or before sign-in from *हिंदी में देखें*. The choice is saved on the phone and on the account, so your other phones follow.
  - Dates follow the language (14 फ़र॰ 2026). Amounts keep Indian grouping in Latin digits.
- **App lock** (More → *App lock*): asks for the phone's fingerprint, face or PIN when the app opens and after a minute or more away, so a quick trip to the camera doesn't relock it. It needs a screen lock on the phone. If that is removed later, the app opens rather than lock the family out of their own ledger.
- **Delete account** (More, or the setup screen with no ledger): type your email to confirm.
  - Your name, email and sign-in are erased from the server straight away, along with any ledger only you use.
  - A ledger you own that others use must be handed over or deleted first, so nobody loses a family's record by surprise.
  - Gifts you logged in other families' ledgers stay as their record, without your name or email.
- **[Privacy policy](docs/privacy-policy.md):** linked from More.

## Run it

You need **Node 22+** and **MongoDB running as a replica set**, because sync uses transactions. MongoDB Atlas always is one.

**1. Start a local database** (once):

```bash
mkdir -p ~/shagun-mongo        # data folder, kept outside the repo
mongod --dbpath ~/shagun-mongo --port 27017 --replSet rs0
mongosh --port 27017 --eval 'rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "127.0.0.1:27017" }] })'
```

If something else already uses port 27017 (for example a MongoDB Windows service), pick another port and change it in `MONGODB_URI`.

**2. Install and configure.** The example values work for a local run on an Android emulator:

```bash
npm install
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env
```

> **Keep `MONGODB_URI` on a test database while developing.** `npm run api` syncs indexes on whatever database it names, and with `DEV_LOGIN` on, a demo sign-in writes sample ledgers there.

**3. Start the API and the app:**

```bash
npm run api       # API on http://localhost:4000/health
npm run mobile    # Expo dev server
```

**4. Open the app** using one of the options below, tap *Developer sign-in* and pick a [demo account](#demo-accounts).

### Where to open the app

- **Android emulator:** press `a` in the Expo dev server.
  - The emulator reaches your computer at `http://10.0.2.2:4000`, the default in `apps/mobile/.env.example`.
  - Alternatively, use `http://localhost:4000` and run `adb reverse tcp:4000 tcp:4000`. Run it again after every emulator restart.
- **Phone on the same Wi-Fi:** set `EXPO_PUBLIC_API_URL=http://<your computer's LAN IP>:4000`, then scan the QR code with Expo Go. The phone needs the Expo Go release for SDK 58, and Expo CLI offers to install it when an older one is on the device.
- **Web preview:** run `npm --workspace apps/mobile run web`, then open `http://localhost:8081`.
  - Set `EXPO_PUBLIC_API_URL=http://localhost:4000` in the app, and keep `CORS_ORIGINS=http://localhost:8081` on the API.
  - SQLite runs as WebAssembly and needs `SharedArrayBuffer`. The dev server sends the required cross-origin isolation headers (see `metro.config.js`), and a hosted web build must send them too.

### What works where

| | Web preview | Expo Go on Android | Android development or release build |
|---|---|---|---|
| Ledger, events, gifts, people, sync, merge | ✓ | ✓ | ✓ |
| Hindi | ✓ | ✓ | ✓ |
| Developer sign-in and demo accounts | ✓ | ✓ | Debug builds only |
| Google sign-in | | | ✓ |
| Invite-card scanning | *Type it in instead* | *Type it in instead* | ✓ |
| App lock | | ✓ | ✓ |
| Contacts | | ✓ | ✓ |
| Rename, hand over or delete a ledger; delete account | ✓ | ✓ | ✓ |
| Sign out, entry long-press menu, member actions | | ✓ | ✓ |
| PDF register | Opens for printing | Share sheet | Share sheet |
| Excel | Downloads | Share sheet | Share sheet |

The web preview's gaps in the sign-out row come from `Alert.alert`, which does nothing on react-native-web, so those actions need a phone.

iOS hasn't been checked. Card scanning is Android only, Face ID needs a development build, and Google sign-in needs `GOOGLE_IOS_URL_SCHEME`.

### Demo accounts

With `EXPO_PUBLIC_DEV_LOGIN=1` in the app and `DEV_LOGIN=true` on the API, the *Developer sign-in* card lists four accounts that need no typing:

| Account | Sharma parivaar | Yadav parivaar |
|---|---|---|
| Asha Sharma | Owner | Viewer |
| Rohan Sharma | Editor | Owner |
| Meena Sharma | Viewer | Editor |
| Kabir Joshi | | |

- **The ledgers** have people in English and Hindi, past and upcoming functions, every payment mode, a cash count ₹500 short and two merge suggestions.
- **Kabir** starts with no ledger, for trying setup and invite codes.
- **Seeding:** the first demo sign-in writes the samples to the API's database (`apps/api/src/demo.ts`). Without `DEV_LOGIN` the route doesn't exist, and production refuses `DEV_LOGIN`.
- **Later sign-ins** leave your changes alone. Dates are counted from the first sign-in, so the upcoming functions pass after about six weeks. To start over, drop the API's database, and the next demo sign-in seeds it again.

### Development build

Google sign-in and card scanning are native modules, so they need a development build rather than Expo Go. Run these from `apps/mobile`:

- **In the cloud with EAS** (recommended on Windows): `npx eas-cli@latest build --profile development --platform android`. The first time, follow [docs/RELEASE.md](docs/RELEASE.md).
- **Local:** `npx expo run:android`
  - **On Windows, this also needs two short paths,** because the native build's paths otherwise pass the 260-character limit. See [Building on this computer](docs/RELEASE.md#building-on-this-computer-instead).

The bundled ML Kit models add about 4 MB per script per CPU architecture.

### Commands

| Command | What it does |
|---|---|
| `npm run api` | API with reload on save, on port 4000 |
| `npm run mobile` | Expo dev server |
| `npm --workspace apps/mobile run android` | Expo dev server, opening Android |
| `npm --workspace apps/mobile run web` | Web preview on port 8081 |
| `npm test` | Tests in all workspaces |
| `npm run typecheck` | Type checks in all workspaces |
| `npm --workspace apps/mobile run db:generate` | SQL migration after changing `src/db/schema.ts` |

### Configuration

**API** (`apps/api/.env`):

| Variable | Needed | Purpose |
|---|---|---|
| `MONGODB_URI` | Always | Must be a replica set |
| `JWT_ACCESS_SECRET` | Always | Signs access tokens, 32+ characters |
| `GOOGLE_CLIENT_IDS` | In production | The **web** OAuth client ID, comma-separated. The API won't start in production without it |
| `DEV_LOGIN` | Local only | `true` enables email-only sign-in. The API won't start in production with it on |
| `CORS_ORIGINS` | Web preview only | Allowed browser origins, comma-separated |
| `PORT` | Optional | Defaults to 4000 |
| `NODE_ENV` | Optional | Defaults to `development` |

**App** (`apps/mobile/.env`). `EXPO_PUBLIC_*` values are baked into the app bundle, so never put a secret in them:

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_API_URL` | Where the API runs |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | The **web** OAuth client ID. Turns on Google sign-in in native builds |
| `EXPO_PUBLIC_DEV_LOGIN` | `1` shows *Developer sign-in*. Release builds ignore it |
| `GOOGLE_IOS_URL_SCHEME` | iOS only: the reversed iOS client ID |

## Deploy

For building the app and publishing it on Google Play, including the first test on a real phone, see **[docs/RELEASE.md](docs/RELEASE.md)**.

### Google sign-in setup (once)

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create a project and the OAuth consent screen (External, testing mode, add your family's emails as test users).
2. Create an OAuth client of type **Web application**. Its client ID goes in:
   - `GOOGLE_CLIENT_IDS` on the API
   - `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in the app
3. Create an OAuth client of type **Android**, with package `com.shagunregister.app` and the SHA-1 of your signing key.
   - Debug build: `cd apps/mobile/android && ./gradlew signingReport` (the folder appears after the first `npx expo run:android`)
   - EAS builds: `npx eas-cli@latest credentials`
   - Play Console: the app signing key's SHA-1, under *App integrity*. Add that one too.

### API on Render + MongoDB Atlas

1. **Database:** create a free MongoDB Atlas cluster and a database user. Under Network Access, allow `0.0.0.0/0`: Render's free tier has no fixed IPs, and the user password protects access. Copy the connection string.
2. **Render:** create a Blueprint from `render.yaml` in this repository ([github.com/ChinmayDubey231/shagun-register](https://github.com/ChinmayDubey231/shagun-register)). It asks for `MONGODB_URI` and `GOOGLE_CLIENT_IDS`, and generates `JWT_ACCESS_SECRET` itself.
3. **Connect the app:** set `EXPO_PUBLIC_API_URL` in the app to the Render URL.
   - Free Render services sleep after 15 minutes idle, so the first request takes about 30 s.
   - Nothing breaks while it sleeps: the app works offline and retries.

## How it works

```
Phone                                             Server
Screens ⇄ SQLite (records + outbox) ⇄ sync engine ⇄ Express API ⇄ MongoDB (replica set)
```

Screens only ever read and write SQLite. The sync engine moves changes between the phone and the server in the background, so the app behaves the same with or without a connection.

**Stack:**
- **App:** Expo Router, expo-sqlite with Drizzle, Zustand, i18next, Fuse.js, and a local Expo module for ML Kit.
- **API:** Express 5, Mongoose, zod and Google Auth Library, run with tsx.
- **Shared:** zod schemas, the API contract and the match key, used by both sides.

### Repository layout

```
apps/
  mobile/                 Expo app (npm workspace @shagun/mobile)
    src/app/              Screens: sign-in, setup, scan-invite, (tabs)/ Home · Events · People · More, events/, people/, family/, account/
    src/components/       SignInIntro (opening animation), LockScreen, SyncDriver, layout (TabHeading, cards), ledger (SyncStatus, SyncPill, entry rows)
    src/db/               Drizzle schema, write path and queries (ledger.ts), useDbQuery hook
    src/sync/             Sync engine (push/pull, no Expo imports) and the two-phone integration test
    src/lib/              API client, account, language, app lock, contacts, sync triggers, exports (build a file, open the share sheet)
    src/store/            Session state
    src/export/           Excel writer (xlsx.ts), ledger workbook, event register HTML
    src/scan/             Invite-card parser and merging of the two OCR readings
    src/theme/            Tokens from the design's UI kit: colours, spacing, type scale
    src/i18n/             en.json, hi.json, and a test that keeps their keys and placeholders matching
    drizzle/              Generated SQL migrations
    modules/invite-text/  Local Expo module (Android): ML Kit text recognition, Latin + Devanagari
    metro.config.js       .sql imports, wasm assets, and the web preview's cross-origin isolation headers
    eas.json              Build profiles: development, preview, production
  api/                    Express API (npm workspace @shagun/api)
    src/routes/           auth.ts (Google, dev sign-in, refresh, /me), families.ts (families, invites, members), sync.ts
    src/sync.ts           Push/pull, sequence numbers, conflict rules, entry history
    src/deletion.ts       Account deletion, and erasing deleted ledgers after 30 days
    src/demo.ts           Sample ledgers for the demo accounts
    test/                 supertest + mongodb-memory-server (real replica set)
packages/
  shared/                 zod schemas, API contract, match key, duplicate suggestions, rupee formatting, demo account list
docs/                     Privacy policy, release guide, app icon
.github/workflows/        Typecheck and tests on every pull request
render.yaml               Render Blueprint for the API
```

### Data

| Where | Tables | Purpose |
|---|---|---|
| Phone and server | `people`, `events`, `entries`, `cashCounts` | The ledger, synced per family |
| Phone only | `outbox`, `sync_meta`, `app_settings` | Waiting changes, sync position and role per ledger, device settings |
| Server only | `users`, `families`, `memberships`, `invites`, `refreshTokens`, `entryHistory` | Accounts, access, sequence counters, replaced versions of entries |

### Sync

Every save writes the record and an outbox row in one SQLite transaction. Sync then runs as **push, then pull**.

- **Push** (`POST /sync/push`) takes up to 100 changes.
  - Each record is validated on its own, so one bad record doesn't sink the batch. Refused records are parked with the reason and shown on More.
  - Every write takes the family's next sequence number (`families.lastSeq`, `$inc`) in the same MongoDB transaction as the write. A pull therefore can never see seq 11 while seq 10 is still uncommitted.
- **Pull** (`GET /sync/pull`) returns records above `since` across all four tables in seq order, up to 500 a page with `hasMore`. The phone's clock is never used for ordering.
  - The phone upserts each record unless it still has a pending local change, and saves `lastPulledSeq` in the same SQLite transaction. Interrupting it at any point loses and doubles nothing.
- **Conflict rules:**
  - New records never conflict, because ids are UUIDs made on the phone.
  - For edits, the last write to reach the server wins, and the replaced version of an entry goes to `entryHistory`.
  - Deletes are soft and win over later edits.
  - An identical retry changes nothing and gets no new seq.
  - Merges stick like deletes. Anything that arrives late for a merged person moves to the kept one, chains are followed, and a loop (two phones merging opposite ways) is dropped.
- **The server doesn't trust the phone** for the person match key (recomputed) or for who logged a gift (`createdBy` comes from the token).
- **Triggers:** startup and sign-in, back to the foreground, connection back, 5 s after a save (so a burst of gifts goes up as one batch), pull-to-refresh on every list, and *Sync now* on More. There is one sync at a time, and a request mid-sync runs once more straight after.
- **"Online" means our server answers:** NetInfo checks `/health` instead of a Google URL, and the phone retries every 30 s while the last attempt failed.
- **Role lost while offline:** if this account became a viewer, its queued changes are parked rather than retried, and pulling continues.

### Accounts and security

- **Tokens:** the server verifies Google ID tokens (audience = your web client ID), then issues its own 15-minute JWTs and 30-day refresh tokens. Refresh tokens are stored hashed and replaced on every use. Reusing an old one revokes all of that user's tokens.
- **On the phone:** tokens are kept in the Android Keystore via expo-secure-store, and being signed in works offline. Ledgers are per account, so another account signing in on the same phone doesn't see them.
- **Access:** one middleware enforces the role table. Non-members get 404, not 403, so family ids can't be probed. The phone's write path also refuses viewers.
- **Invite codes** have no look-alike characters (0/O/1/I/L).
- **Deleted data:** a deleted ledger stays on the server for 30 days in case of a mistake, then a job that runs daily and at every server start erases it for good. Deleting an account erases the ledgers only it used straight away.
- **Rate limits:** sign-in and refresh allow 30 attempts per 15 minutes, and invite codes allow 10 per 15 minutes per user.
- **Logs and errors:** request logs never include bodies, which carry names and amounts. Every error has the shape `{ error: { code, message } }`.

### API

| Endpoint | Who | What |
|---|---|---|
| `GET /health` | Anyone | Health check |
| `POST /auth/google` | Anyone | Sign in with a Google ID token |
| `POST /auth/dev` | Anyone, only with `DEV_LOGIN` | Email-only sign-in, which also seeds the demo ledgers for a demo account |
| `POST /auth/refresh`, `POST /auth/logout` | Holder of a refresh token | Replace or revoke it |
| `GET /me`, `PATCH /me` | Signed in | The account and its ledgers; change name or language |
| `GET /me/deletion` | Signed in | What deleting the account would do to each ledger |
| `DELETE /me` | Signed in | Delete the account. Refused while it owns a ledger others use |
| `POST /families` | Signed in | Register a ledger. Idempotent: the phone sends the id it made offline |
| `GET /families/:id` | Viewer and up | Ledger details and members |
| `PATCH /families/:id`, `DELETE /families/:id` | Owner | Rename or delete |
| `POST /families/:id/owner` | Owner | Hand over to another member |
| `POST /families/:id/invites`, `GET …/invites`, `DELETE …/invites/:code` | Owner | Create, list or cancel invites |
| `POST /invites/:code/accept` | Signed in | Join. Joining again never changes a role |
| `PATCH /families/:id/members/:userId` | Owner | Change a role |
| `DELETE /families/:id/members/:userId` | Owner, or the member themselves | Remove or leave. The owner can't leave |
| `POST /sync/push` | Editor and up | Send outbox changes |
| `GET /sync/pull?familyId=&since=&limit=` | Viewer and up | Fetch changes |
| `GET /families/:id/entries/:entryId/history` | Viewer and up | Replaced versions of an entry |

## Testing

```bash
npm test            # all workspaces
npm run typecheck
```

The tests start their own in-memory MongoDB replica set, so they never touch the database in `.env`. The MongoDB binary downloads the first time. GitHub Actions runs the same checks on every pull request and every push to `main`.

| Tests | Cover |
|---|---|
| `packages/shared/src/*.test.ts` | Match key and transliteration, duplicate suggestions, rupee formatting, the amount keypad, schemas |
| `apps/api/test/accounts.test.ts` | Sign-in, token rotation, rate limits, roles, invites, refusing `DEV_LOGIN` in production |
| `apps/api/test/sync.test.ts` | Sequence order and paging, conflict rules, safe retries, concurrent pushes, merges |
| `apps/api/test/deletion.test.ts` | Hand-over, the 30-day purge, what account deletion erases and what it refuses |
| `apps/api/test/demo.test.ts` | Seeding once, roles, nothing added without `DEV_LOGIN` |
| `apps/api/test/app.test.ts` | Health, error shape, CORS |
| `apps/mobile/src/db/ledger.test.ts` | The write path on real SQLite: atomic saves, names, cash, merges, accounts, language and lock settings |
| `apps/mobile/src/sync/sync.integration.test.ts` | Two real SQLite phones running the app's own sync code against the real API and MongoDB |
| `apps/mobile/src/scan/parseInvite.test.ts` | English, Hindi and mixed cards, and merging the two OCR readings |
| `apps/mobile/src/export/export.test.ts` | Workbook parts and number formats, and the register's grouping, totals and HTML escaping |
| `apps/mobile/src/i18n/i18n.test.ts` | `hi.json` matches `en.json`: keys, placeholders, plural forms, and real Hindi rather than copied English |

The integration test covers the main promise of the app. Both phones go offline and log 10 gifts each, one edits a gift the other logged, and the other deletes a different one. Coming back in either order, both end with 19 live entries and identical totals. It also covers a push whose reply is lost, a pull cut off between pages, and two phones merging the same pair in opposite directions.

**Not covered by automated tests:** there are no screen tests, Google sign-in uses a fake verifier, and the parser tests start from text rather than from ML Kit. Screens were checked by hand during development:
- **Web preview** with two browsers, the real API and MongoDB: joining by invite code, going offline, syncing, merging and exports.
- **Android 16 emulator** in Expo Go: Hindi on every screen, App lock with fingerprint and PIN, a phone with no screen lock, and both exports reaching the share sheet.

## Design decisions

**Data**
- **The local database is the source of truth.** Each save writes the record and an outbox row in a single transaction, so a crash can never leave a gift saved but unqueued.
- **Money is stored as integer whole rupees.** All totals go through `sumAmounts`. Display uses Indian digit grouping (₹3,77,500). The largest single gift is ₹99,99,999, which guards against typos.
- **Ids are UUIDs made on the phone,** so two relatives logging offline at the same wedding never collide. The family id is also made on the phone, so `POST /families` can register the same id.
- **Live queries come from `useDbQuery`.** Drizzle's `useLiveQuery` only watches a query's main table, so an event total wouldn't refresh when an entry was added. `useDbQuery` re-runs a query when any table it lists changes.
- **A merge is an edit, not a delete.** The merged person stays with `mergedInto`, every change is queued, and the merge syncs like any edit.
- **Language and app lock belong to the phone first.** Both live in `app_settings`, so they work offline and outlast sign-out. The language is also saved on the account so the family's other phones follow; the lock is per phone.
- **Card reading and exports stay on the phone.** Nothing leaves the phone except through the share sheet.

**Names**
- **The match key lives in `packages/shared`,** so the phone's search and duplicate suggestions and the server's stored keys always agree.
- **It removes honorifics and folds spelling variants:** Shri, Smt, ji, Dr, श्री, जी and डॉ go, and aa→a, ee→i, oo→u, w→v, ph→f, x→ks, doubled letters, word-final ey→e and trailing a fold together.
- **It uses a custom transliterator, not a Sanskrit library.** Sanskrit schemes keep every inherent vowel (कमला → kamalā), which never matches how Hindi names are typed. The custom transliterator applies Hindi schwa deletion instead (कमला → kamlaa).

**Look and feel**
- **Two typefaces, each with one job:** Rozha One marks identity (the sign-in title, the श mark, the ledger name and the tab titles), and Mukta covers everything else in Latin and Devanagari. Small-caps labels use the theme's `eyebrow` style, and in Devanagari they drop the letter spacing, which breaks the line along the top of the words.
- **Colour is for attention, not decoration.** Sindoor and marigold come from the UI kit. The sync status stays quiet when everything is saved and turns marigold only while changes wait on the phone. Direction is never shown by colour alone: received is blue with ↙, given is orange with ↗.
- **The sign-in opening** takes about 1.7 s: the toran thread draws, marigolds drop and sway, the श mark pops, a ₹ shagun coin lands, and शगुन रजिस्टर is inked in.
- **Animations only move opacity and transforms on the native driver,** so typing is never delayed, and Reduce motion skips them. The opening needs no new native libraries.
- **Forms avoid the keyboard with `behavior="padding"` on Android too.** With Android's edge-to-edge layout the window doesn't resize for the keyboard, so leaving `behavior` unset let it cover the field being typed in and the buttons below it.

## History

| Stage | What it added | Commit |
|---|---|---|
| Week 1 | Offline app foundation: setup, events, Quick Entry, event detail, people, outbox | `20b749d` |
| Week 2 | Hindi/English name matching, fuzzy search, contacts, person history, cash count | `b292b0e` |
| Week 3 | API, Google sign-in, shared ledgers, invite codes, roles | `c028a26` |
| Week 4 | Sync between phones | `b96afcc` |
| Design pass | Sign-in animation, branded headers, web preview database fix | `85aa09e`, `a3bf0f5`, `6fbde0a` |
| Week 5 | Duplicate merge, invite-card scanning, PDF and Excel exports | `7e9c61b` |
| Week 6 | Hindi throughout, app lock | `eb25aaf` |
| After week 6 | Demo accounts, Android keyboard and PDF export fixes | `549d1c3` |
| Release readiness | Rename, hand over and delete ledgers; 30-day purge; account deletion; privacy policy; EAS build profiles; CI | |

Each week's acceptance checks are written out in full in the [week-by-week README](https://github.com/ChinmayDubey231/shagun-register/blob/549d1c38385c530f495a38fbb9bc72cb9b292775/README.md).

## Still open

1. **First run on a real phone.** Google sign-in has never run, because it needs your Google Cloud setup. A development build on an Android 16 emulator has run the ledger controls, account deletion, App lock with a simulated fingerprint and the PIN, and card scanning from gallery images. A real camera, fingerprint sensor and face unlock haven't been tried.
2. **First EAS build.** `eas.json` and `expo-dev-client` are in place, but no cloud build has run yet, because it needs your Expo account. Follow [docs/RELEASE.md](docs/RELEASE.md).
3. **Recent-apps preview.** With App lock on, Android's recent-apps screen still shows the last screen. Hiding it (`FLAG_SECURE`) would also block screenshots, so it's left as a choice.
4. **Web preview actions.** Sign out, the entry long-press menu and member actions use `Alert.alert`, which does nothing on the web. The web preview is a development tool, so this only affects testing.
