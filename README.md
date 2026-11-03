<p align="center">
  <img src="docs/app-icon.png" alt="Shagun Register icon: a white श on a sindoor tile, with a marigold ₹ coin on its corner" width="128">
</p>

<h1 align="center">Shagun Register</h1>

A private family ledger for wedding and function gifts: log what you receive and give, work offline at the venue, and look up the full give-and-take history with any family.

React Native (Expo SDK 58) · Node.js + Express · MongoDB · TypeScript throughout.

## Status: Week 6 done (Hindi, app lock)

Weeks 1–6 are complete: an offline ledger, Hindi/English name matching, accounts and shared ledgers, sync between phones, duplicate merging, invite-card scanning and PDF/Excel exports, and now the whole app in Hindi and an app lock. Between weeks 4 and 5 the app also had a design pass:

- **Sign-in opening animation:**
  - The toran thread draws, marigolds drop and sway, the श mark pops, and a ₹ shagun coin lands with a glint.
  - The name rises, शगुन रजिस्टर is inked in, and the rest staggers in (about 1.7 s).
  - It uses React Native Animated on the native driver, with no new native libraries. With Reduce motion on, the finished screen shows at once.
- **Branded headers:**
  - **Home:** the ledger's initial sits on a sindoor monogram tile with a marigold dot, echoing the sign-in mark. A small-caps "FAMILY LEDGER" label sits over the ledger name, which is set in the Rozha One wordmark in sindoor. Tapping the name still opens the ledger switcher.
  - **Sync status:** the green pill became a small-caps line facing that label. It reads **✓ ALL SAVED** in green when everything is on the server. While changes wait it turns marigold: **N TO SYNC**, **N ON PHONE** (offline) or **SYNCING…**.
  - **Events, People and More** share one `TabHeading`: the ledger name in small caps, the tab name in the wordmark with a marigold full stop ("Events."), and a count where useful ("3 EVENTS", "12 IN LEDGER"). The count is hidden at zero.
- **Fixes:**
  - **Web preview database:** the preview at `http://localhost:8081` now opens its database. Expo serves the root page ahead of Metro's `enhanceMiddleware`, so the cross-origin isolation headers SQLite needs were missing on `/`. They're now set where the dev server is created.
  - **Android subtitle:** "शगुन रजिस्टर" on sign-in is no longer cut to "शगुन". Android rounded the reveal box's width down a fraction of a pixel and wrapped the last word onto a clipped line.

## What each week delivered

### Week 6: Hindi and app lock

**Done when** the whole app reads in Hindi, a language chosen on one phone follows the account to the others, and a phone with App lock on asks for its fingerprint, face or PIN before showing the ledger. These checks prove it:
- **Translation tests** (`apps/mobile/src/i18n/i18n.test.ts`): `hi.json` has exactly the keys `en.json` has, the same `{{placeholders}}`, a form for each Hindi plural category, and Hindi text rather than copied English.
- **Phone tests** (`apps/mobile/src/db/ledger.test.ts`): a language chosen on the phone stays pending until the account has it, an older save doesn't clear a newer choice, the account's language is taken without being sent back, an unknown value is ignored, and the lock setting is remembered.
- **A browser run** (web preview, real API and MongoDB), with no page errors:
  - *हिंदी में देखें* on sign-in switches the screen to Hindi, and after developer sign-in the account's language is `hi`.
  - Setup, Home, a new event, Quick Entry, Events, People and More all show in Hindi, and a reload keeps it.
  - Choosing English on More switches the app at once and saves `en` to the account.
- **An Android run** (Android 16 emulator in Expo Go, real API and MongoDB):
  - **Hindi:** sign-in, setup, Home, a new event, Quick Entry, Events, People, a person's page, cash count, family members and More all read in Hindi with no clipped matras. A restart and a sign-out keep it, and a language changed on the account arrives at the next start, even behind the lock.
  - **Locking:** ten seconds away doesn't relock, seventy seconds does, and a restart opens locked. Cancelling stays on the lock screen, and its button asks again.
  - **Changing it:** turning it on or off asks first. Cancelling or a wrong PIN changes nothing.
  - **Fingerprint:** a wrong finger is refused, and too many wrong tries fall back to the PIN.
  - **No screen lock:** the switch stays off with a hint. If the screen lock is removed later, the app opens and the switch can still be turned off.
  - **Exports:** the PDF register draws Hindi correctly, and both exports reach the share sheet with Hindi file names.

What it does:
- **Hindi** (`apps/mobile/src/i18n/hi.json`):
  - **Coverage:** every screen and message, the Excel columns and the PDF register. The ledger is a बही, a gift a शगुन, a function a रस्म.
  - **Choosing:** *Language* on More (English / हिंदी), or before sign-in from the link under the sign-in buttons.
  - **Saving:** the app switches at once and the phone keeps the choice. It's also saved to the account (`PATCH /me`), and offline it goes up with the next account sync. A phone with no unsaved choice takes the account's language, so a change made on one phone reaches the others.
  - **Formatting:** dates and months follow the language (14 फ़र॰ 2026). Amounts keep Indian grouping in Latin digits.
  - **Small-caps labels in Devanagari** drop the letter spacing, which breaks the line along the top of the words, and go up a point.
- **App lock** (More → *App lock*):
  - **Locking:** when it's on, the app opens behind a lock screen and asks for the phone's fingerprint, face or PIN (`expo-local-authentication`). It asks again after a minute or more in the background, so a quick trip to the camera or the share sheet doesn't relock it.
  - **Changing it:** turning it on or off asks for the same check first.
  - **Needs a screen lock** on the phone. If that is removed later, the app opens rather than lock the family out of their own ledger.
  - **Underneath:** the screens stay where they were, and screen readers can't reach them while locked.
  - **Where it works:** Expo Go and builds on Android. Face ID on iOS needs a development build, and the web preview has no lock.

### Week 5: duplicate merge, invite cards, exports

**Done when** a merge made on one phone holds on every phone without losing a gift, an invite card fills in the new-event form, and an event or the whole ledger leaves the phone as a PDF or a spreadsheet. These checks prove it:
- **Two-phone merge tests** (`apps/mobile/src/sync/sync.integration.test.ts`), against the real API and MongoDB:
  - One phone merges "रमेश शर्मा" into "Ramesh Sharma" while the other, offline, logs a gift against "रमेश शर्मा". After syncing, both phones show one person with all three gifts.
  - Two phones merge the same pair in opposite directions while offline. Both settle on one person with every gift.
- **Merge API tests** (`apps/api/test/sync.test.ts`):
  - Gifts that reach the server after the merge, or were already there, move to the kept person, and entry history keeps the old version.
  - An edit from a phone that hadn't heard of the merge doesn't undo it.
  - A loop is dropped, a chain of merges is followed, and a merge into another ledger's person is refused.
- **Phone tests** (`apps/mobile/src/db/ledger.test.ts`): suggestions and "Not the same", moving gifts and hosted functions, filling blanks, the four queued changes, following a stale id, and refusals.
- **Card-reading tests** (`apps/mobile/src/scan/parseInvite.test.ts`): English, Hindi (with Devanagari digits) and mixed wedding cards, a griha pravesh, a birthday with no year, a mundan, and unreadable text. Merging the two OCR readings is tested too.
- **Export tests** (`apps/mobile/src/export/export.test.ts`): the workbook's parts, rows and number formats, and the register's grouping, totals, cash line and HTML escaping. A sample workbook also opens in openpyxl, and a 36-gift register renders in Chromium.
- **A browser run** (web preview, real API and MongoDB), with no page errors:
  - Two spellings of one guest come in by sync, and People shows "1 possible duplicate". Merging leaves one Ramesh Sharma with both gifts and the Hindi spelling and phone filled in.
  - The Excel file downloads and the register opens for printing.
  - The new-event form filled from a card creates the event.

What it does:
- **Duplicate merge:**
  - **Suggestions** (`packages/shared/src/duplicates.ts`):
    - People are suggested when they share a match key and their cities don't conflict, or when they share a 10-digit phone number. Cities are compared by consonant skeleton, so Indore and इंदौर agree.
    - A banner on People leads to them. *Not the same* hides a pair on this phone.
  - **Merge** (from a suggestion, or the merge icon on a person):
    - Choose which entry stays. The other's gifts and hosted functions move across, and its city, phone, relation and Hindi spelling fill any blanks.
    - The merged person keeps `mergedInto` instead of being deleted. Every change is queued, so the merge syncs like any edit.
    - A link to the merged person opens the kept one, and Quick Entry follows a stale id.
  - **On the server:**
    - Merges stick like deletes: an edit from a phone that hadn't heard of the merge keeps it.
    - Gifts and functions logged against the merged person on other phones move to the kept one.
    - Chains are followed, and a loop (two phones merging opposite ways) is dropped.
- **Scan invite card:**
  - **Taking the photo:** take one, or choose one from the gallery, for example a card that came on WhatsApp.
  - **Reading it:** a local Expo module (`apps/mobile/modules/invite-text`) runs Google ML Kit's Latin and Devanagari recognizers on the phone. Where both read the same line, the more confident reading wins.
  - **Finding the details** (`apps/mobile/src/scan/parseInvite.ts`):
    - the type, and the date of the main function: Hindi or English months, Devanagari digits, dd.mm.yyyy, or no year (the next time that date comes round);
    - the couple or child, the host family and the venue;
    - a wedding's functions: Sagai, Tilak, Haldi, Mehendi, Sangeet, Mayra, Wedding and Reception.
  - **Filling the form:** the new-event form opens filled in as another family's function, with a note to check it. The recognized text stays viewable.
  - **Privacy:** the photo stays in the app's cache and nothing is uploaded.
  - **Where it works:** it needs an Android development or release build. Expo Go, iOS and the web preview offer *Type it in instead*. The bundled models add about 4 MB per script per CPU architecture.
- **Exports** (`apps/mobile/src/export`), made from the phone's own database, so they work offline; viewers can export too:
  - **PDF register** (the share icon on an event):
    - totals, the split by mode, and the latest cash count against cash logged;
    - every gift in the order it was logged, grouped by function with subtotals.
    - It's A4, made with expo-print and shared with expo-sharing.
  - **Excel** (More → *Export to Excel*):
    - Gifts, People and Events sheets, with real dates and amounts as numbers in Indian grouping (12,34,567);
    - frozen headers and filters.
    - A small SpreadsheetML writer zipped with fflate (`xlsx.ts`) makes it, with no native code.

### Week 4: sync between phones

**Done when** two phones log entries offline at the same time and both end up with every entry. Three checks prove it:
- **Two-phone integration test** (`apps/mobile/src/sync/sync.integration.test.ts`). Two real SQLite databases run the app's own ledger and sync code against the real API on a real MongoDB replica set. It automates the guide's manual offline test:
  - Both phones go offline and log 10 gifts each. Then one edits a gift the other logged, and the other deletes a different one.
  - They come back online in either order. Both end with 19 live entries, the edit and the delete, and identical totals.
  - Also covered: a push whose reply is lost (retried without doubling or new sequence numbers), a pull cut off between pages (resumes), a local change made during a pull (kept, then pushed), an edit racing a delete (the delete wins on both phones), and a change the server refuses (parked, not retried forever).
- **Sync API tests** (`apps/api/test/sync.test.ts`): sequence order and paging, roles, safe retries, last-write-wins with history, deletes winning, partial rejection, cross-family id hijack refused, and two concurrent pushes getting gap-free sequence numbers 1–40.
- **A two-phone browser run.** Both phones lose the server and log gifts (3 and 4). Each shows how many changes are waiting and that it's offline. Coming back online syncs by itself. Both end with all 7, and a correction made on one phone shows on the other. All 13 checks pass.

What it does:
- **API** (`apps/api/src/sync.ts`, `routes/sync.ts`):
  - **`POST /sync/push`** takes up to 100 outbox changes. Each record is validated on its own, so one bad record doesn't sink the batch. Every write takes the family's next sequence number (`families.lastSeq`, `$inc`) in the same MongoDB transaction as the write. A pull therefore can never see seq 11 while seq 10 is still uncommitted.
  - **`GET /sync/pull?since=`** returns records above `since` across all four tables in seq order, up to 500 a page with `hasMore`. The phone's clock is never used for ordering.
  - **Conflict rules:**
    - New records never conflict (UUIDs made on the phone).
    - For edits, the last write to reach the server wins, and the replaced version of an entry goes to `entryHistory` (`GET /families/:id/entries/:entryId/history`).
    - Deletes are soft and win over later edits.
    - An identical retry changes nothing and gets no new seq.
  - **The server doesn't trust the phone** for the person match key (recomputed) or for who logged a gift (`createdBy` comes from the token).
- **Phone** (`apps/mobile/src/sync/engine.ts`, `src/lib/sync.ts`):
  - **Push, then pull.** Accepted outbox rows are deleted. Refused ones are parked with the reason and shown on More as "not accepted by the server". The server's canonical copy is written back at once, so a late edit to a deleted gift corrects itself.
  - **Pull** upserts each record unless it still has a pending local change, and saves `lastPulledSeq` in the same SQLite transaction. Interrupting it at any point loses and doubles nothing.
  - **Triggers:** startup and sign-in, back to the foreground, connection back, 5 s after a save (so a burst of gifts goes up as one batch), pull-to-refresh on every list, and *Sync now* on More. There is one sync at a time; a request mid-sync runs once more straight after.
  - **"Online" means our server answers:** NetInfo checks `/health` instead of a Google URL, and the phone retries every 30 s while the last attempt failed.
  - **Status:** the Home header reads *Syncing…*, *N on phone* (offline), *N to sync* or *All saved*; More shows the same as a pill. A gift to a new guest counts as one change, not two. More also shows when the phone last synced and any refused changes.
  - **Role lost while offline:** if this account became a viewer, its queued changes are parked rather than retried, and pulling continues.

### Week 3: backend and accounts

**Done when** two family members can join the same ledger. Two checks prove it:
- **API tests** (`apps/api/test/accounts.test.ts`) run against a real MongoDB replica set.
- **A two-phone browser run** uses separate browsers, the real API and MongoDB. Chinmay signs in and creates "Dubey parivaar" offline-first, then makes an editor invite code. Neha signs in on the second phone and joins with the code (typed lower-case with a dash). Both see the two members. When Chinmay makes Neha a viewer, her phone goes read-only on the next launch. All 13 checks pass.

What it does:
- **API** (Express 5 + Mongoose, `apps/api`):
  - **Sign-in:** Google ID tokens are verified on the server (audience = your web client ID). The server issues its own 15-minute JWTs and 30-day refresh tokens. Refresh tokens are stored hashed and replaced on every use; reusing an old one revokes all of that user's tokens.
  - **Endpoints:** `POST /auth/google`, `/auth/refresh`, `/auth/logout`, `GET/PATCH /me`, `POST /families` (idempotent: the phone sends the id it made offline), `GET/PATCH/DELETE /families/:id`, invites (create / list / cancel / accept), and member role change or removal.
  - **Roles:** one middleware enforces the guide's role table. Non-members get 404, not 403, so family ids can't be probed.
  - **Invite codes:** 6 characters with no look-alikes (0/O/1/I/L), 48-hour TTL, reusable until they expire, and guessing is rate-limited per user.
  - **Safety:** one error shape everywhere, request logs without bodies, and the config refuses `DEV_LOGIN` in production.
- **App:**
  - **Sign-in:** Google sign-in (development build), plus an optional email-only *Developer sign-in* for emulators.
  - **Tokens:** kept in the Android Keystore via expo-secure-store and refreshed automatically. Being signed in works offline.
  - **Getting into a ledger:** create (offline; registered with the server when online) or join with a code.
  - **Family members:** invite code with Share, roles, remove, leave.
  - **Switching:** tap the ledger name in the Home header to switch ledgers; sign out from More.
  - **Viewers:** the app is read-only for them (no New event / Log a gift / edit), and the write path refuses too.
- **On this phone:**
  - **Per-account ledgers:** another account signing in on the same phone doesn't see them. Ledgers made before sign-in existed are claimed by the first account.
  - **Server changes picked up:** whenever the app opens or comes to the foreground it applies renames and role changes, adds ledgers joined on another phone, and deletes ledgers you were removed from (records included).

### Week 2: Hindi/English name matching, search, cash count

- **Hindi/English match key** (`packages/shared/src/matchKey.ts`):
  - Removes honorifics (Shri, Smt, ji, Dr, श्री, जी, डॉ …).
  - Converts Devanagari to Latin, dropping the silent "a" the way Hindi names are actually spelled (कमला → kamla, not kamala).
  - Folds spelling variants: aa→a, ee→i, oo→u, w→v, ph→f, x→ks, doubled letters, word-final ey→e, trailing a.
  - Results: "Shri Ramesh Sharma ji", "रमेश शर्मा" and "Ramesh Sharmaa" all give `ramesh sharm`.
- **Fuzzy search** with Fuse.js on the match key, with prefix and consonant-skeleton matches ranked first.
  - Used in Quick Entry, Home search, the People tab and the host-family field.
  - People stored with an older key are re-keyed once at startup.
- **Typed names are reused when unambiguous.** Typing "Sunita Mishra" without picking a suggestion reuses "Smt. Sunita Mishra" when she is the only exact match, and asks you to pick when there are several.
- **Contacts import** (expo-contacts):
  - Permission is asked only the first time you tap "Search phone contacts". Matches appear under the people suggestions.
  - Contacts are held in memory and never stored unless you pick one.
  - Contact *writes* are blocked in `app.json`.
- **City for new people**, so "Ramesh Sharma (Indore)" and "Ramesh Sharma (Bhopal)" stay apart.
- **Person history:**
  - An upcoming-invite card ("They gave ₹2,100 at …" plus "Log what you gave").
  - All / Given / Received filters, and "N exchanges since YYYY · last in Mon YYYY".
  - An edit screen for name, city, phone and relation.
- **Fix an entry:** long-press it on the event screen and choose Edit or Delete. Quick Entry opens in edit mode, keeping the entry's id and creation time.
- **Cash reconciliation:**
  - Logged cash vs. counted cash, with a short / over / matches banner.
  - A checklist of cash entries (largest first) for finding the missing envelope.
  - Every saved count is kept as an audit trail and queued for sync.
- **People tab:** relation filter chips.

### Week 1: offline app foundation

- **Setup:** first launch asks you to name the family ledger.
- **Events:** your own function or another family's, with sub-functions.
- **Quick Entry:** amount chips, keypad, mode, relation, and **Save and next**.
- **Event detail:** totals and per-entry sync marks.
- **Other screens:** Home, People and person history.
- **Saved for sync:** every save writes an outbox row in the same SQLite transaction.

## Repository layout

```
apps/
  mobile/            Expo app (Expo Router, routes in src/app/)
    src/app/         Screens: sign-in, setup, (tabs)/ Home · Events · People · More, events/, people/ (incl. duplicates, merge), family/, scan-invite
    src/components/  SignInIntro (opening animation), LockScreen, layout (TabHeading, cards), ledger (SyncStatus, SyncPill, entry rows)
    src/db/          Drizzle schema, write path + queries (ledger.ts), useDbQuery hook
    src/sync/        Sync engine (push/pull, no Expo imports) + two-phone integration test
    src/lib/         API client, account, language, app lock, sync triggers, exports (build a file, open the share sheet)
    src/export/      Excel writer (xlsx.ts), ledger workbook, event register HTML
    src/scan/        Invite-card parser and merging of the two OCR readings
    src/theme/       Tokens from the design's UI kit: colours, spacing, type scale (incl. eyebrow)
    src/i18n/        en.json, hi.json, and a test that keeps their keys and placeholders matching
    drizzle/         Generated SQL migrations
    modules/invite-text/  Local Expo module (Android): ML Kit text recognition, Latin + Devanagari
    metro.config.js  .sql imports, wasm assets, and the web preview's cross-origin isolation headers
  api/               Express 5 + Mongoose: auth, families, invites, roles, sync
    src/sync.ts      Push/pull, sequence numbers, conflict rules, entry history
    src/routes/      auth.ts (Google, refresh, /me), families.ts (families, invites, members), sync.ts
    test/            supertest + mongodb-memory-server (real replica set)
packages/
  shared/            zod schemas, API contract, match key, duplicate suggestions, rupee formatting — used by phone and server
```

## Run it

Requires Node 22+ and MongoDB **running as a replica set**, because sync uses transactions. MongoDB Atlas always is one. For a local database, start a single-node replica set once:

```bash
mkdir -p ~/shagun-mongo        # data folder, kept outside the repo
mongod --dbpath ~/shagun-mongo --port 27017 --replSet rs0
mongosh --port 27017 --eval 'rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "127.0.0.1:27017" }] })'
```

If something else already uses port 27017 (for example a MongoDB Windows service), pick another port and change it in `MONGODB_URI`.

```bash
npm install
cp apps/api/.env.example apps/api/.env        # MONGODB_URI, JWT_ACCESS_SECRET (32+ chars), DEV_LOGIN=true for local
cp apps/mobile/.env.example apps/mobile/.env  # EXPO_PUBLIC_API_URL, EXPO_PUBLIC_DEV_LOGIN=1, Google web client ID
npm run api       # API on http://localhost:4000/health
npm run mobile    # Expo dev server
npm test          # all workspaces (API tests download a MongoDB binary the first time)
npm run typecheck
```

### Where to open the app

- **Web preview:** run `npm --workspace apps/mobile run web`, then open `http://localhost:8081`.
  - Set `EXPO_PUBLIC_API_URL=http://localhost:4000` in the app, and keep `CORS_ORIGINS=http://localhost:8081` on the API.
  - SQLite runs as WebAssembly and needs `SharedArrayBuffer`. The dev server sends the required `Cross-Origin-Embedder-Policy` and `Cross-Origin-Opener-Policy` headers (see `metro.config.js`); a hosted web build must send them too.
- **Android emulator:** run `npm run mobile`, then press `a` (or run `npx expo start --android`).
  - The emulator reaches your computer at `http://10.0.2.2:4000`, which is the default in `apps/mobile/.env.example`.
  - Alternatively, keep `http://localhost:4000` and run `adb reverse tcp:4000 tcp:4000`. Run it again after every emulator restart.
- **Phone on the same Wi-Fi:** set `EXPO_PUBLIC_API_URL=http://<your computer's LAN IP>:4000`, then scan the QR code with Expo Go.

**Expo Go vs development build:**
- **Expo Go** runs everything except Google sign-in, invite-card scanning and Face ID. Use *Developer sign-in* (`EXPO_PUBLIC_DEV_LOGIN=1` in the app, `DEV_LOGIN=true` on the API).
  - The phone needs the Expo Go release for SDK 58. Expo CLI offers to install it when an older one is on the device.
  - **Demo accounts:** the *Developer sign-in* card lists four accounts that need no typing. Asha, Rohan and Meena share two sample ledgers with different roles: people in English and Hindi, past and upcoming functions, every payment mode, a cash count ₹500 short and two merge suggestions. Kabir starts with no ledger, for trying setup and invite codes.
    - The first demo sign-in writes the samples to the API's database (`apps/api/src/demo.ts`). Without `DEV_LOGIN` the route doesn't exist, and production refuses `DEV_LOGIN`.
    - Later sign-ins leave your changes alone. Dates are counted from that first sign-in, so the upcoming functions pass after about six weeks. To start over, empty the local database.
- **Google sign-in and card scanning need a development build**, because they're native modules: `npx expo run:android`, or `npx eas-cli@latest build --profile development --platform android`.
  - **On Windows, keep the repo in a short folder** such as `C:\dev\shagun-register`. From a 73-character path, `npx expo run:android` stops with `ninja: error: mkdir(...)`: CMake repeats the repo path inside its build folders, which goes past Windows' 260-character limit. EAS builds in the cloud, so it isn't affected.

### Google sign-in setup (once)

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create a project and the OAuth consent screen (External, testing mode, add your family's emails as test users).
2. Create an OAuth client of type **Web application**. Its client ID goes in:
   - `GOOGLE_CLIENT_IDS` on the API
   - `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in the app
3. Create an OAuth client of type **Android**, with package `com.shagunregister.app` and the SHA-1 of your signing key.
   - Debug build: `cd apps/mobile/android && ./gradlew signingReport`
   - EAS builds: `npx eas-cli@latest credentials`
   - Play Console: the app signing key's SHA-1, under *App integrity*. Add that one too.

### Deploy the API (Render + MongoDB Atlas)

1. **Database:** create a free MongoDB Atlas cluster and a database user. Under Network Access, allow `0.0.0.0/0`: Render's free tier has no fixed IPs, and the user password protects access. Copy the connection string.
2. **Render:** create a Blueprint from `render.yaml` in this repository ([github.com/ChinmayDubey231/shagun-register](https://github.com/ChinmayDubey231/shagun-register)). It asks for `MONGODB_URI` and `GOOGLE_CLIENT_IDS`, and generates `JWT_ACCESS_SECRET` itself.
3. **Connect the app:** set `EXPO_PUBLIC_API_URL` in the app to the Render URL.
   - Free Render services sleep after 15 minutes idle, so the first request takes about 30 s.
   - Nothing breaks while it sleeps: the app works offline and retries.

## Design decisions

- **The local database is the source of truth.** Screens read and write only SQLite. Each save writes the record and an outbox row in a single transaction, so a crash can never leave a gift saved but unqueued.
- **Money is stored as integer whole rupees.** All totals go through `sumAmounts`. Display uses Indian digit grouping (₹3,77,500).
- **Ids are UUIDs made on the phone**, so two relatives logging offline at the same wedding never collide. The family id is also made on the phone, so `POST /families` can register the same id.
- **Live queries come from `useDbQuery`.** Drizzle's `useLiveQuery` only watches a query's main table, so an event total wouldn't refresh when an entry was added. `useDbQuery` re-runs a query when any table it lists changes.
- **Typing a name without picking a suggestion** reuses the person when exactly one exact match exists, and asks you to pick when there are several. This keeps duplicates down; the rest show up as duplicate suggestions.
- **The match key lives in `packages/shared`**, so the phone's search and duplicate suggestions and the server's stored keys always agree. Merges are only ever suggested, never automatic.
- **A merge is an edit, not a delete.** The merged person stays with `mergedInto`, and the server treats it like a delete: it sticks, and anything that arrives late for that person goes to the one kept.
- **Language and app lock belong to the phone first.** Both live in `app_settings`, so they work offline and outlast sign-out. The language is also saved on the account so the family's other phones follow; the lock is per phone.
- **Card reading and exports stay on the phone.** ML Kit reads the photo on the device, and the photo isn't kept. PDFs and spreadsheets are made from the local database. Nothing leaves the phone except through the share sheet.
- **Name matching uses a custom transliterator, not a Sanskrit library.** Sanskrit schemes keep every inherent vowel (कमला → kamalā), which never matches how Hindi names are typed. The custom transliterator applies Hindi schwa deletion instead.
- **Two typefaces, each with one job:**
  - **Rozha One** (the wordmark) marks identity: the sign-in title, the श mark, the ledger name and the tab titles.
  - **Mukta** covers everything else, in Latin and Devanagari.
  - **Small-caps labels** use the theme's `eyebrow` text style.
- **Colour is for attention, not decoration.** Sindoor and marigold come from the UI kit. The sync status stays quiet when everything is saved and turns marigold only while changes wait on the phone. Direction is never shown by colour alone: received is blue with ↙, given is orange with ↗.
- **Animations only move opacity and transforms on the native driver**, so typing is never delayed, and Reduce motion skips them.
- **Forms avoid the keyboard with `behavior="padding"` on Android too.** With Android's edge-to-edge layout the window doesn't resize for the keyboard, so leaving `behavior` unset let it cover the field being typed in and the buttons below it.

## Next

Still open from week 6:

1. **Try it on a real phone and a development build:** the Android checks ran on an emulator in Expo Go, so a real fingerprint sensor, face unlock and a development build are still untried.
2. **Recent-apps preview:** with App lock on, Android's recent-apps screen still shows the last screen. Hiding it (`FLAG_SECURE`) would also block screenshots, so it's left as a choice.
