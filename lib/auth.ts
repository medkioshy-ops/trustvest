import "server-only";
import { timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { getUser } from "./supabase/server";

/** For pages and Server Actions: the signed-in user or a redirect to /login. */
export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/** For API routes: a signed-in session, or `Authorization: Bearer $CRON_SECRET` (scheduler). */
export async function authorizeRequest(req: Request): Promise<"user" | "scheduler" | null> {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization");
  if (secret && header?.startsWith("Bearer ")) {
    const given = Buffer.from(header.slice(7));
    const expected = Buffer.from(secret);
    if (given.length === expected.length && timingSafeEqual(given, expected)) return "scheduler";
  }
  return (await getUser()) ? "user" : null;
}
