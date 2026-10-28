# Shagun Register

A private family ledger for wedding and function gifts: log what you receive and give, work offline at the venue, and look up the full give-and-take history with any family.

React Native (Expo SDK 58) · Node.js + Express · MongoDB (from week 3) · TypeScript throughout.

## Status: Week 2 done (history and search)

**Week 2 is done when** one old family register is fully typed in and searchable. A browser run checks exactly that: it types in a 20-person register mixing Hindi and English names, then searches it in both scripts. All 17 checks pass. The guide's match-key examples are covered by unit tests.

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
  api/             Express + TypeScript skeleton (health route, shared error shape)
packages/
  shared/          zod schemas, enums, rupee formatting — used by phone and server
```

## Run it

Requires Node 20+.

```bash
npm install
npm run mobile          # Expo dev server; scan the QR code with Expo Go on Android
npm run api             # API on http://localhost:4000/health
npm test                # all workspaces
npm run typecheck
```

- **Expo Go is enough for week 1**, because every native module used so far ships with Expo Go. From week 5 (ML Kit OCR) you'll need a development build: `npx expo run:android` or `eas build --profile development`.
- **Browser preview:** `npm --workspace apps/mobile run web`. SQLite runs as WebAssembly there; Android is the real target.

After changing `apps/mobile/src/db/schema.ts`, generate a migration with:

```bash
npm --workspace apps/mobile run db:generate
```

## Design decisions

- **The local database is the source of truth.** Screens read and write only SQLite. Each save writes the record and an outbox row in a single transaction, so a crash can never leave a gift saved but unqueued.
- **Money is stored as integer whole rupees.** All totals go through `sumAmounts`. Display uses Indian digit grouping (₹3,77,500).
- **Ids are UUIDs made on the phone**, so two relatives logging offline at the same wedding never collide. The family id is also made on the phone, so `POST /families` in week 3 can register the same id.
- **Live queries come from `useDbQuery`.** Drizzle's `useLiveQuery` only watches a query's main table, so an event total wouldn't refresh when an entry was added. `useDbQuery` re-runs a query when any table it lists changes.
- **Typing a name without picking a suggestion** reuses the person when exactly one exact match exists, and asks you to pick when there are several. This keeps duplicates down before merge arrives in week 5.
- **The match key lives in `packages/shared`**, so the phone's search and the server's duplicate check (week 5) always compute identical keys. Merges are only ever suggested, never automatic.
- **Name matching uses a custom transliterator, not a Sanskrit library.** Sanskrit schemes keep every inherent vowel (कमला → kamalā), which never matches how Hindi names are typed. The custom transliterator applies Hindi schwa deletion instead.

## Next: Week 3 (backend and accounts)

1. Mongoose models and indexes; MongoDB Atlas cluster.
2. Google Sign-In, server-side token check, JWT access and refresh tokens.
3. Families, memberships, invite codes and role middleware. The phone's local family id gets registered with `POST /families`.
4. Deploy the API on Render.

**Done when** two family members can join the same ledger.
