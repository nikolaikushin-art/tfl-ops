# TFL: first deployment checklist (Vercel)

Do these in order. Section A must pass on your computer before anything goes live.

## A. Build and check (on your computer, needs internet once)
1. `npm install`
2. `npm run build` must finish with no errors. (v1.10.0: build, typecheck, lint (0 errors) and all 444 tests passed.)
3. `npm run typecheck:all` and `npm run lint` should be clean; fix or report anything they print.
4. `npm run test` (full vitest suite; v1.10.0 passed 444 / 444).
5. `npm run dev` and click through every module (see section D).

## B. Real sign-in and database (see SERVER-SETUP.md for the why)
Order matters. If you switch the demo login off before the server accounts work, nobody can sign in.
1. Vercel > Storage > add **Upstash for Redis**. It adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
2. Add `TFL_SESSION_SECRET` (32+ random characters). The old `RENSO_` names are gone: if you already set `RENSO_SESSION_SECRET`, `RENSO_USERS` or `RENSO_INSECURE_COOKIES` in Vercel, rename them to `TFL_SESSION_SECRET`, `TFL_USERS`, `TFL_INSECURE_COOKIES`.
3. For each person: `node tools/hash-password.mjs "a long password"`, then put the results in `TFL_USERS` as JSON (format in `.env.example`).
4. Redeploy and sign in with a real account. Settings > Data Management > "Server database" must say connected. Make a change, reload on another device, and check it appears.
5. Only then add `VITE_DEMO_LOGIN=off` and redeploy. The built-in demo password is inside the public JavaScript, so anyone could read it.
6. Open `/api/state?backups` as an administrator the next day to confirm daily backups exist.

## C. Fill in the company details
Settings > Organisation: legal name, address, VAT number, company number, phone, email, website. They print on quotations and invoices. They start blank on purpose.
Set `DEFAULT_VAT_PCT` in `src/tfl/model.ts` (20 = UK standard rate; 0 if TFL is not VAT registered).
Set the real reply-to address in `src/components/OnboardingForm.tsx` and the sending domain in Settings > Campaign sending.

## D. Click-through test (every module, with real-looking data)
For locations, site assessments, shortlists & packs, owners & suppliers, productions, enquiries, site visits, bookings, quotations, invoices, payments & deposits, contracts, permits, insurance & certificates:
- create a record with only the required fields, then with every field filled; edit it; delete it
- try bad input: empty required field, bad email, negative number, end date before start date
- link records (production on a booking, owner on a location) and open them from the linked-records list
- search, status filter, sort a column; Export CSV then Import it back (duplicates must be skipped)
- bookings: make two overlapping bookings on one location: both must show the warning
- quotation / invoice: VAT total and balance correct; Print / PDF shows your company block
- attach a file, reopen, download, delete the record (file goes too)
- on a phone and at narrow widths; sign out and back in; reload and check nothing is lost

## D2. Also click through (new in v1.10.0)
- Calendar: add a task due tomorrow, an invoice due last week, a permit expiring next week: each must show; click one to open its record
- Smart views: create an overdue invoice, an insurance certificate under the minimum cover, a confirmed booking with no insurance: each must appear under its view with a count
- Settings > Film Location: change the invoice prefix and payment terms, save, create a new invoice: reference and due date follow
- Sign in as a non-administrator role: Settings must be missing from the menu and show a message if opened

## E. Known limits (decide if each is acceptable for launch)
- All data is one shared snapshot (max about 4 MB). Fine for one to three people; not for many editing at once.
- Attachments are stored in the browser that added them only. They are not synced or backed up.
- Email and WhatsApp screens are not connected to a sending service (there is no send API in `api/`).
- Roles (v1.9.2): the menu and TFL screens follow the table in `src/tfl/access.ts`; the server refuses saves from `readonly` accounts. Settings is still open to every signed-in user.
- Server sign-in and sync were tested with an in-memory database and mocks, not against real Upstash or on Vercel.
- Personal data (contacts, owners) falls under UK GDPR: add a privacy notice and agree who may see what before real use.

## F. Local login (v1.9.2)
Without a server the demo login is `admin@thefilmlocation.com` / `TFL888+++`. Switch it off on the hosted build (`VITE_DEMO_LOGIN=off`) once real accounts work.
