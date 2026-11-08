// FR8 — on-demand ledger integrity check. 200 = intact, 409 = tampering found.
import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";
import { verifyLedger } from "@/lib/ledger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const who = await authorizeRequest(req);
  if (!who) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const db = who === "scheduler" ? createAdminClient() : await createClient();
    const result = await verifyLedger(db);
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
