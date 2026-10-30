# Shagun Register

A private family ledger for wedding and function gifts: log what you receive and give, work offline at the venue, and look up the full give-and-take history with any family.

React Native (Expo SDK 58) · Node.js + Express · MongoDB · TypeScript throughout.

## Status: Week 4 done (sync)

**Week 4 is done when** two phones log entries offline at the same time and both end up with every entry. Three checks prove it:
- **Two-phone integration test** (`apps/mobile/src/sync/sync.integration.test.ts`). Two real SQLite databases run the app's own ledger and sync code against the real API on a real MongoDB replica set. It automates the guide's manual offline test:
  - Both phones go offline and log 10 gifts each. Then one edits a gift the other logged, and the other deletes a different one.
  - They come back online in either order. Both end with 19 live entries, the edit and the delete, and identical totals.
  - Also covered: a push whose reply is lost (retried without doubling or new sequence numbers), a pull cut off between pages (resumes), a local change made during a pull (kept, then pushed), an edit racing a delete (the delete wins on both phones), and a change the server refuses (parked, not retried forever).
- **Sync API tests** (`apps/api/test/sync.test.ts`): sequence order and paging, roles, safe retries, last-write-wins with history, deletes winning, partial rejection, cross-family id hijack refused, and two concurrent pushes getting gap-free sequence numbers 1–40.
- **A two-phone browser run.** Both phones lose the server and log gifts (3 and 4). Each shows "N waiting" and an offline pill. Coming back online syncs by itself. Both end with all 7, and a correction made on one phone shows on the other. All 13 checks pass.

### Week 4

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
  - **Status:** the header pill reads *Syncing…*, *N on phone* (offline), *N to sync* or *All saved*. A gift to a new guest counts as one change, not two. More shows when it last synced and any refused changes.
  - **Role lost while offline:** if this account became a viewer, its queued changes are parked rather than retried, and pulling continues.

### Week 3

**Week 3 is done when** two family members can join the same ledger. Two checks prove it:
- **API tests** (`apps/api/test/accounts.test.ts`) run against a real MongoDB replica set.
- **A two-phone browser run** uses separate browsers, the real API and MongoDB. Chinmay signs in and creates "Dubey parivaar" offline-first, then makes an editor invite code. Neha signs in on the second phone and joins with the code (typed lower-case with a dash). Both see the two members. When Chinmay makes Neha a viewer, her phone goes read-only on the next launch. All 13 checks pass.

### Week 3

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
  - **Switching:** a ledger switcher from the Home header, sign out from More.
  - **Viewers:** the app is read-only for them (no New event / Log a gift / edit), and the write path refuses too.
- **On this phone:**
  - **Per-account ledgers:** another account signing in on the same phone doesn't see them. Ledgers made before sign-in existed are claimed by the first account.
  - **Server changes picked up:** whenever the app opens or comes to the foreground it applies renames and role changes, adds ledgers joined on another phone, and deletes ledgers you were removed from (records included).

### Week 2

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

### Week 1

- **Setup:** first launch asks you to name the family ledger.
- **Events:** your own function or another family's, with sub-functions.
- **Quick Entry:** amount chips, keypad, mode, relation, and **Save and next**.
- **Event detail:** totals and per-entry sync marks.
- **Other screens:** Home, People and person history.
- **Saved for sync:** every save writes an outbox row in the same SQLite transaction.

Scanning invite cards (week 5) still opens a placeholder screen.

## Repository layout

```
apps/
  mobile/          Expo app (Expo Router, routes in src/app/)
    src/db/        Drizzle schema, write path + queries (ledger.ts), useDbQuery hook
    src/theme/     Tokens from the design's UI kit
    src/components/
    src/i18n/      en.json now; hi.json in week 6
    drizzle/       Generated SQL migrations
    src/sync/      Sync engine (push/pull, no Expo imports) + two-phone integration test
    src/lib/       API client, account, sync triggers
  api/             Express 5 + Mongoose: auth, families, invites, roles, sync
    src/sync.ts    Push/pull, sequence numbers, conflict rules, entry history
    src/routes/    auth.ts (Google, refresh, /me), families.ts (families, invites, members), sync.ts
    test/          supertest + mongodb-memory-server (real replica set)
packages/
  shared/          zod schemas, API contract, match key, rupee formatting — used by phone and server
```

## Run it

Requires Node 22+.

```bash
npm install
cp apps/api/.env.example apps/api/.env        # fill in MONGODB_URI and JWT_ACCESS_SECRET
cp apps/mobile/.env.example apps/mobile/.env  # EXPO_PUBLIC_API_URL, Google web client ID
npm run api       # API on http://localhost:4000/health
npm run mobile    # Expo dev server
npm test          # all workspaces (API tests download a MongoDB binary the first time)
npm run typecheck
```

**Expo Go vs development build:**
- **Expo Go** still runs everything except Google sign-in. Use *Developer sign-in* (`EXPO_PUBLIC_DEV_LOGIN=1` in the app, `DEV_LOGIN=true` on the API).
- **Google sign-in needs a development build**, because it's a native module: `npx expo run:android`, or `npx eas-cli@latest build --profile development --platform android`.

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
2. **Repo:** push this repo to GitHub.
3. **Render:** create a Blueprint from `render.yaml`. It asks for `MONGODB_URI` and `GOOGLE_CLIENT_IDS`, and generates `JWT_ACCESS_SECRET` itself.
4. **Connect the app:** set `EXPO_PUBLIC_API_URL` in the app to the Render URL.
   - Free Render services sleep after 15 minutes idle, so the first request takes about 30 s.
   - Nothing breaks while it sleeps: the app works offline and retries.

## Design decisions

- **The local database is the source of truth.** Screens read and write only SQLite. Each save writes the record and an outbox row in a single transaction, so a crash can never leave a gift saved but unqueued.
- **Money is stored as integer whole rupees.** All totals go through `sumAmounts`. Display uses Indian digit grouping (₹3,77,500).
- **Ids are UUIDs made on the phone**, so two relatives logging offline at the same wedding never collide. The family id is also made on the phone, so `POST /families` in week 3 can register the same id.
- **Live queries come from `useDbQuery`.** Drizzle's `useLiveQuery` only watches a query's main table, so an event total wouldn't refresh when an entry was added. `useDbQuery` re-runs a query when any table it lists changes.
- **Typing a name without picking a suggestion** reuses the person when exactly one exact match exists, and asks you to pick when there are several. This keeps duplicates down before merge arrives in week 5.
- **The match key lives in `packages/shared`**, so the phone's search and the server's duplicate check (week 5) always compute identical keys. Merges are only ever suggested, never automatic.
- **Name matching uses a custom transliterator, not a Sanskrit library.** Sanskrit schemes keep every inherent vowel (कमला → kamalā), which never matches how Hindi names are typed. The custom transliterator applies Hindi schwa deletion instead.

## Next: Week 5 (merge, OCR, exports)

1. **Duplicate merge:** suggestions from the shared match key, and a merge that moves entries and leaves `mergedInto` on the old person (synced like any other change).
2. **Scan invite card:** on-device text recognition fills the new-event form.
3. **Exports:** a PDF of an event's register and an Excel file of the whole ledger, shared from the phone.
