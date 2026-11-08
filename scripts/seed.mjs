// One-off setup: creates the TrustVest admin login and the wallet row.
// Usage: npm run seed   (reads .env.local)
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL || process.env.SEED_USER_EMAIL;
const password = process.env.ADMIN_PASSWORD || process.env.SEED_USER_PASSWORD;
const currency = (process.env.SEED_WALLET_CURRENCY || "USD").toUpperCase();

function fail(msg) {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

if (!url || !serviceKey) fail("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
if (!email || !password) {
  fail("Set ADMIN_EMAIL and ADMIN_PASSWORD in .env.local (or legacy SEED_USER_EMAIL / SEED_USER_PASSWORD)");
}
if (password.length < 10) fail("Admin password must be at least 10 characters");

const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

// 1. User
const { data: list, error: listErr } = await db.auth.admin.listUsers({ perPage: 1000 });
if (listErr) fail(`Listing users failed: ${listErr.message}`);
const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
let userId = existing?.id;
if (existing) {
  const { error } = await db.auth.admin.updateUserById(existing.id, { password });
  if (error) fail(`Updating user failed: ${error.message}`);
  console.log(`✔ User ${email} already existed — password updated`);
} else {
  const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) fail(`Creating user failed: ${error.message}`);
  userId = created.user?.id;
  console.log(`✔ Created user ${email}`);
}

// 2. Wallet (one row per user — migration 003)
if (!userId) fail("Could not resolve admin user id after create");

const { data: wallet, error: wErr } = await db.from("wallet").select("*").eq("user_id", userId).maybeSingle();
if (wErr) fail(`Reading wallet failed: ${wErr.message}. Did you run migrations 001–003?`);
if (wallet) {
  console.log(`✔ Wallet already exists for admin (${wallet.currency} ${wallet.balance})`);
} else {
  const { error } = await db.from("wallet").insert({ user_id: userId, currency, balance: 0 });
  if (error) fail(`Creating wallet failed: ${error.message}`);
  console.log(`✔ Created ${currency} wallet with balance 0 — deposit funds from the dashboard`);
}

console.log("\nSupabase checklist:");
console.log("  • Authentication → Providers → Google: enable and set OAuth credentials");
console.log("  • Authentication → URL configuration: add redirect https://<your-host>/auth/callback");
console.log("  • Authentication → Sign In / Providers → enable “Allow new users to sign up” for /join");
