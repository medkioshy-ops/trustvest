# Pre-push spot check

## One-time Supabase (after code deploy)

1. SQL Editor → run `supabase/migrations/20261025000003_per_user_wallet.sql` (after 001 & 002).
2. Authentication → enable **Allow new users to sign up** + **Google** provider.
3. URL configuration: **Site URL** = `NEXT_PUBLIC_SITE_URL`; add `https://<host>/auth/callback` and `http://localhost:3000/auth/callback`.
4. (Recommended) Email provider → disable **Confirm email** for instant `/join`, or users must confirm inbox first.

## Admin (`.env.local` only)

```env
ADMIN_EMAIL=medkioshy@gmail.com
ADMIN_PASSWORD=<10+ chars>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`npm run seed` — admin user + wallet with `user_id`.

## Per-user wallets

Each account gets its own wallet row. Decision log/ledger remain shared read for now (prototype).

## Routes

See prior table: `/` public, `/join`, `/login`, `/dashboard` + app routes gated by `proxy.ts`.

## Commands

```bash
npm run build
npm test
npm run dev
npm run spot-check
```
