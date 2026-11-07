# Turning on the server database and real sign-in (v111)

Nothing changes until you set the variables below. Without them the app works from the browser exactly as before.

## Steps (about 15 minutes, on Vercel)
1. **Database.** Vercel project > Storage > add **Upstash for Redis** (Marketplace). It adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` itself.
2. **Secret.** Add `TFL_SESSION_SECRET`: 32+ random characters.
3. **Accounts.** For each person run `node tools/hash-password.mjs "a long password"` and put the result in `TFL_USERS` (see `.env.example`). Roles: `administrator` sees Residency; any other role does not.
4. **Switch off the demo login.** Add `VITE_DEMO_LOGIN=off` and redeploy (it is read at build time).
5. Redeploy. Sign in with the new account. Settings > Data Management > "Server database" should say connected.

## What it does
- Sign-in is checked on the server (scrypt hashes, signed httpOnly cookie, 7 days, 8 failed tries per 15 min per address and email). The browser never sees a password list.
- Every saved change uploads about 1.5 s later. On sign-in the latest server copy loads, so a second device or a virtual assistant sees the same data.
- If two devices changed data, the server copy is loaded and this browser's unsynced copy is kept under `tfl.conflict.last`. It does not merge field by field.
- A backup of the previous state is kept for each day (30 days). Administrators can read one at `/api/state?backup=YYYY-MM-DD` and list them at `/api/state?backups`.

## Limits (be straight with Roni)
- It is one shared snapshot of all data, not separate database tables. Fine for one to three users; not for many people editing at once.
- Read-check-write, not a transaction: two saves at the same instant could both pass. Rare for this team size.
- The throttle is per server instance, so it slows guessing but is not a hard lock.
- Files and attachments are not stored on the server yet. Documents keep their records, not the binary files.
- Data already in a browser stays there too; sign out on shared computers.
- Not tested against a real Upstash database or on Vercel. The logic is tested with an in-memory store and a mocked REST call.

## Notes added in v112
- The built-in demo password is part of the app code. On the hosted build always set `VITE_DEMO_LOGIN=off`, otherwise anyone who reads the code can sign in on their own device (they would still get no server data, because the server cookie is missing, but they would see the sign-in as open).
- Failed-attempt throttling is kept in the memory of each server instance, so it slows guessing but is not a hard limit. Use a strong password.
- Signing out leaves the last copy of the data in that browser. On a shared computer clear the browser site data after signing out.
