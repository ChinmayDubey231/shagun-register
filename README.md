# Shagun Register

A private family ledger for wedding and function gifts: log what you receive and give, work offline at the venue, and look up the full give-and-take history with any family.

React Native (Expo SDK 58) · Node.js + Express · MongoDB (from week 3) · TypeScript throughout.

## Status: Week 1 done (offline app foundation)

**Done when:** you can log 20 entries in airplane mode and see the total. This is covered by an automated test (`apps/mobile/src/db/ledger.test.ts`) and was also run end to end in a browser.

What works now, all offline on the phone:

- **First launch:** name your family ledger.
- **Events:** create your own function (gifts received) or another family's (gifts given), with sub-functions (haldi, mehendi, sangeet, wedding, reception, or your own). The events list has All / Received / Given filters and year headings.
- **Quick Entry:**
  - Name search with each person's last exchange, or add a new person in one tap.
  - Relation chips, amount chips (101 / 501 / 1,100 / 2,100 / 5,100) and an on-screen keypad.
  - Mode: Cash, UPI, Cheque or Item, plus an optional note.
  - **Save and next** keeps the screen open with the direction, function and mode unchanged.
- **Event detail:** running total, cash/UPI/item split, function tabs, and a pending/synced mark on every entry. Long-press an entry to delete it (soft delete).
- **Home:** upcoming and recent events, and one search box for people and events.
- **People and person history:** totals both ways and a timeline of every exchange.
- **Sync status:** every save also writes an outbox row in the same SQLite transaction, ready for the week 4 sync engine.

Routes for later weeks exist as placeholders: scan invite card (week 5) and cash reconciliation (week 2).

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
- **Name matching is a placeholder for now.** `simpleNameKey` (lowercase, no punctuation) stands in until week 2 brings the full Hindi/English match key and Fuse.js.

## Next: Week 2

1. Match-key function in `packages/shared` with tests: honorifics, Devanagari transliteration, spelling folds.
2. Fuse.js autocomplete and contacts import.
3. Person history: upcoming-invite card and filters.
4. Cash reconciliation screen.
