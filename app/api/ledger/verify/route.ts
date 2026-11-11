// FR8 — on-demand ledger integrity check. 200 = intact, 409 = tampering found.
// A signed-in user verifies their own wallet's chain; the scheduler verifies every wallet.
import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { verifyLedger } from "@/lib/ledger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, getUser } from "@/lib/supabase/server";
import { getUserWallet } from "@/lib/wallet-scope";

export async function GET(req: Request) {
  const who = await authorizeRequest(req);
  if (!who) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    if (who === "scheduler") {
      const db = createAdminClient();
      const { data: wallets, error } = await db.from("wallet").select("wallet_id");
      if (error) throw new Error(error.message);
      const results = await Promise.all(
        (wallets ?? []).map(async (w) => ({ wallet_id: w.wallet_id as string, ...(await verifyLedger(db, w.wallet_id)) })),
      );
      const ok = results.every((r) => r.ok);
      return NextResponse.json({ ok, wallets: results }, { status: ok ? 200 : 409 });
    }
    const user = await getUser();
    const db = await createClient();
    const wallet = user ? await getUserWallet(db, user.id) : null;
    if (!wallet) return NextResponse.json({ error: "No wallet for this account" }, { status: 404 });
    const result = await verifyLedger(db, wallet.wallet_id);
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
