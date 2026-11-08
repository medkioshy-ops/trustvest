// One-off setup: creates the single TrustVest login (FR1) and the wallet row.
// Usage: npm run seed   (reads .env.local)
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.SEED_USER_EMAIL;
const password = process.env.SEED_USER_PASSWORD;
const currency = (process.env.SEED_WALLET_CURRENCY || "USD").toUpperCase();

function fail(msg) {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

if (!url || !serviceKey) fail("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
if (!email || !password) fail("Set SEED_USER_EMAIL and SEED_USER_PASSWORD in .env.local");
if (password.length < 10) fail("SEED_USER_PASSWORD must be at least 10 characters");

const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

// 1. User
const { data: list, error: listErr } = await db.auth.admin.listUsers({ perPage: 1000 });
if (listErr) fail(`Listing users failed: ${listErr.message}`);
const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
if (existing) {
  const { error } = await db.auth.admin.updateUserById(existing.id, { password });
  if (error) fail(`Updating user failed: ${error.message}`);
  console.log(`✔ User ${email} already existed — password updated`);
} else {
  const { error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) fail(`Creating user failed: ${error.message}`);
  console.log(`✔ Created user ${email}`);
}
const others = list.users.filter((u) => u.email?.toLowerCase() !== email.toLowerCase());
if (others.length) console.warn(`! ${others.length} other user(s) exist. TrustVest is single-user — remove them in Supabase → Authentication.`);

// 2. Wallet (single row, enforced by a unique index)
const { data: wallet, error: wErr } = await db.from("wallet").select("*").limit(1).maybeSingle();
if (wErr) fail(`Reading wallet failed: ${wErr.message}. Did you run the SQL migrations?`);
if (wallet) {
  console.log(`✔ Wallet already exists (${wallet.currency} ${wallet.balance})`);
} else {
  const { error } = await db.from("wallet").insert({ currency, balance: 0 });
  if (error) fail(`Creating wallet failed: ${error.message}`);
  console.log(`✔ Created ${currency} wallet with balance 0 — deposit funds from the dashboard`);
}

console.log("\nDone. Remember to turn OFF public sign-ups: Supabase → Authentication → Sign In / Providers → 'Allow new users to sign up'.");
