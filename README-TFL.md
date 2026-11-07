# The Film Location CRM — Stage 2 (module structure)


## v1.10.0
- **Left sidebar** now has 21 modules in six groups: Overview (Dashboard, Calendar, Tasks & Follow-ups, Reports), Locations (Locations, Registrations, Site Assessments, Shortlists & Packs, Owners & Suppliers), Production (Productions, Enquiries, Scouting & Visits, Bookings), Commercial (Quotations, Invoices, Payments & Deposits, Contracts), Compliance (Permits, Insurance & Certificates, Neighbour Notices, Incidents & Claims), Communications.
- **Second sidebar** on every module: New button, Smart views with live counts (overdue, expiring, missing paperwork, high risk, follow-up due and more; red-flag ones are marked), stage filters with counts, and Related modules. The Calendar's sidebar sets the look-ahead and which kinds of dates to show.
- **Calendar**: shoots, visits, follow-ups, quote and invoice dates, permit/insurance/contract expiries, neighbour notices and tasks in one list, with an overdue block.
- **Dashboard**: "Needs attention" list across all modules.
- **Settings > Film Location** (administrators and management): VAT, currency, payment terms, quote validity, numbering prefixes (next number is automatic), follow-up days, expiry warning days, "starting soon" days, minimum public liability cover, and whether insurance and RAMS are required before a shoot. All of them are used by the app. They are stored with the records, so they sync and back up.
- **Settings > Roles & Permissions** now shows the real table from the access rules. **Settings is now limited to administrators and management** (menu and screen); other roles see a message.
- Removed trading-only settings entries (CRM, Sales, Products, Xero mapping, Currency & trade, Invoicing).

## v1.9.3
- Twilight now uses the same neutral ink tokens as Dark (no navy); Light, Twilight and Dark line up. Side-panel tones in Light are warm bone instead of cool grey.
- Every Renso name is gone: code, CSS classes (`tfl-*`), events, storage keys, env vars (`TFL_SESSION_SECRET`, `TFL_USERS`, `TFL_INSECURE_COOKIES`), cookie `tfl_session`, header `x-tfl`, server keys `tfl:*`. The old archive folder and old Renso checklists were deleted. The legacy KYC-code and backup-tag fallbacks were removed.
- New modules (main menu and second sidebar): Site Assessments, Shortlists & Packs, Payments & Deposits, Insurance & Certificates. More location types: theatre/cinema, museum/gallery, school/university, church/chapel.
- Every module now has a second sidebar: New button, stage filters with counts, and Related modules.

    npm install
    npm run dev      # http://localhost:5173
    npm run build    # verified passing

## Added in Stage 2
- New sidebar: Overview (Dashboard, Reports) · Locations (Locations, Owners & Suppliers) · Production (Productions, Enquiries, Scouting & Visits, Bookings) · Commercial (Quotations, Invoices, Contracts, Permits) · Communications (Email, WhatsApp, Documents) · Settings
- `src/tfl/model.ts` — data model, field definitions, sample data (rows marked "sample")
- `src/tfl/useTfl.ts` — local store (browser localStorage key `tfl.data.v1`), booking-clash detection
- `src/tfl/TflPages.tsx` — generic list/search/filter/add/edit/delete page for every module, TFL dashboard, reports, JSON export, "clear sample data"
- Old TFL trading routes now redirect to the nearest TFL module (e.g. orders -> Bookings, products -> Locations)

## Stage 2b
- Bookings calendar (month grid, clashes in burgundy); branded Print / PDF (logo, scope, totals, balance due) on quotations and invoices

## Cleanup

## Stage 2d
- Records now link by ID (old name links are converted automatically on first load). Click any row to open a detail page: fields, clickable linked records, and everything that links back to it. Deleting a record clears links to it. Dashboard bookings and the calendar open the booking.

## Stage 2e
- Removed the unused trading screens (Orders, Stock, Shipments, Brands, Markets, Products, Quotations, Invoices, Payments, Accounting, Cash flow, Deal Desk, Residency, Price Intel, Requests, KYC, Campaigns, Contacts, Reports v1, Dashboard v2) and the libs and tests that only they used. TflApp.tsx now only routes dashboard, reports, TFL modules, Email, WhatsApp, Documents, Settings.

## Stage 2f
- Server sync: TFL data now rides in the same snapshot as the rest (under the `tfl` key), so it uses the existing sign-in, `api/state.ts`, daily backups and conflict handling. With no server configured nothing changes (browser-only). An older server snapshot without TFL data keeps this browser's copy and uploads it. Needs the server set up as before (TFL_* env vars, Upstash) and was not tested against a live server.

## Stage 2g
- Visible TFL branding removed: letterhead and wordmark now read THE FILM LOCATION; download file names are `tfl-...` (backup, settings, import template); placeholders no longer show thefilmlocation.com.
- Campaign sending defaults are now neutral placeholders (`news.example.com`, `info@yourdomain.com`): set the real TFL domain in Settings > Campaign sending. `OnboardingForm.tsx` has a REPLY_TO placeholder to set.
- Fixed the 2 failing offline tests (stale TFL names). `npm run test:offline`: PASS 358, FAIL 0 (2 files need `npm i`: moduleConfig, offerFiles).

## Stage 2h
- File attachments: every record's detail page has an Attachments panel (attach several files, open, download, remove; 10 MB each). Files are stored in this browser's IndexedDB (`src/tfl/files.ts`), removed when their record is deleted. Pure helpers + tests in `src/lib/attachments.ts`.
- Limit: attachments are NOT in the server sync or the JSON backup, so they exist only in the browser that added them. Syncing them needs server file storage (e.g. Vercel Blob / R2).
- Offline tests: PASS 361, FAIL 0. Not typechecked, built or opened in a browser here.

## Stage 2i: module fields
- Every module has fuller fields for a film-location business (see `MODULES` in `src/tfl/model.ts`). Examples: locations get address, map link, half-day/prep rates, deposit, parking, power, permit and drone flags, features and on-site contact; owners/suppliers get category, WhatsApp, website, TRN, payment terms and bank details; productions get billing details; enquiries get source, handler, follow-up date, location type, crew size and lost reason; bookings get call time, crew, prep notes, deposit status and notes; quotes/invoices get VAT %, enquiry/booking/quote links and terms; contracts and permits get type, value/fee, reference no. and notes.
- Field definitions can now carry `help`, `default` ("today" for dates) and `section` (groups fields under a heading in the editor and detail page). New field types: `email`, `tel`, `url`.
- New records start with defaults (currency GBP, first status, today's dates, VAT 20%, payment terms 30).
- Validation before save (`src/lib/tflRecords.ts`): required fields, email, phone, http(s) links only, no negative numbers, dates in order (booking, shoot, quote, invoice, contract, permit), invoice not paid above its total. Errors show under the field.
- VAT: quotes and invoices store the amount before VAT plus `vatPct`. Totals, balance due, the dashboard and Print/PDF use the amount including VAT. Records saved earlier have no VAT % and count as 0%, so their numbers do not change. The default (20%, UK standard rate) applies to NEW records only: change `DEFAULT_VAT_PCT` in model.ts if TFL does not charge VAT.
- Detail pages show emails, phones and links as clickable.
- Old records need no migration: missing fields just show a dash.
- Offline tests: PASS 370, FAIL 0. Changed files typechecked with a partial setup (React types missing here, so only logic errors were checked); a full `npm run build` is still needed.

## Stage 2j: CSV import/export and sorting
- Every module page has **Export CSV** (the rows currently shown, with link names instead of ids; opens in Excel with Arabic/UTF-8 intact; cells that could run as formulas are neutralised) and **Import CSV**.
- Import (`src/lib/tflCsv.ts`): columns are matched by field name in any order; comma, semicolon or tab separated; dates DD/MM/YYYY or YYYY-MM-DD; "£12,000" style numbers; selects matched ignoring case; links matched by the linked record's name (unmatched link = blank + warning). Rows with errors, and rows whose name already exists (or repeats in the file), are skipped and listed with the reason; nothing is guessed. A **Template** button downloads the header row. New rows get the same defaults and validation as the editor.
- Bulk import gives every row its own unique id (`tflActions.importMany`).
- List columns are sortable: click a header (ascending, descending, off). Numbers sort by value, text naturally ("Villa 2" before "Villa 10"), blanks last.
- Offline tests: PASS 380, FAIL 0.

## Stage 2k: UK market, no sample data
- **No sample data.** A new workspace starts empty: `seed()` in `src/tfl/model.ts` returns empty lists and `src/lib/seed.ts` holds settings only (the 2,500-line TFL trading demo data is gone, so Email/WhatsApp/Documents no longer show TFL content). Two seed-dependent tests were removed or rewritten with their own fixtures. Anyone who already has the old sample records saved still sees a "Remove sample records" button on Reports, shown only while some exist.
- **Sterling first.** Default currency GBP (then EUR, USD, AED); money shows as £12,000; dates show DD/MM/YYYY; CSV import reads day-first dates and £ / € / $ amounts.
- **UK VAT.** `DEFAULT_VAT_PCT = 20` in `model.ts` pre-fills quotations and invoices (use 0 if TFL is not VAT registered). Labels say "VAT registration no.".
- **Dashboard totals are per currency**: "Quotes out" and "Outstanding" show the GBP total plus a note such as "+ €1,200" for other currencies, never one mixed number.
- **UK fields.** Locations: borough/county, postcode, what3words, UK location types (house, country house / estate, warehouse, listed building, park...). Permits: council filming permit, road closure (TTRO), parking suspension, drone permission, police / traffic management, listed building. Bookings: public liability insurance and risk assessment (RAMS) status.
- **Print / PDF** of quotations and invoices now carries the company block from Settings > Organisation (legal name, address, VAT no., company no., contact). VAT number, company number, phone, email and website start blank: fill them in under Settings so nothing invented prints.
- Settings defaults: UK sales regions, film lead sources and client segments, 20% default tax rate.
- Offline tests: PASS 379, FAIL 0.

## Going live
Read `DEPLOY-TFL.md` first (build check, server sign-in order, click-through test, known limits). `SERVER-SETUP.md` explains the database and sign-in.

## Not done yet (next rounds)
- Attachments are local to one browser (see Stage 2h)
- Seed/demo data (`src/lib/seed.ts`) still holds TFL trading sample content and thefilmlocation.com addresses
- Demo sign-in `admin@thefilmlocation.com` / `TFL888+++` is hard-coded in `store.tsx`: set `VITE_DEMO_LOGIN=off` on the hosted build
- Not run in this sandbox: build, typecheck, lint, browser check (no node_modules / network)
