// Scheduler entry point (Level-1 DFD "Scheduler" actor). Vercel Cron calls GET with
// `Authorization: Bearer $CRON_SECRET`; a signed-in user may POST from a script.
import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { runCycle } from "@/lib/cycle";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

async function handle(req: Request) {
  const who = await authorizeRequest(req);
  if (!who) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const db = createAdminClient();
    const { data: wallets, error: wErr } = await db.from("wallet").select("wallet_id");
    if (wErr) throw new Error(wErr.message);
    if (!wallets?.length) throw new Error("No wallets — users must sign up or run seed.");
    const reports = await Promise.all(wallets.map((w) => runCycle(db, w.wallet_id)));
    if (reports.length === 1) {
      return NextResponse.json({ triggeredBy: who, ...reports[0] });
    }
    return NextResponse.json({ triggeredBy: who, multi: true, wallets: reports.length, reports });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
