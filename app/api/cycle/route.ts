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
    const report = await runCycle(createAdminClient());
    return NextResponse.json({ triggeredBy: who, ...report });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
