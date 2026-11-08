// Local stand-in for Supabase's HTTP API (Auth password login + a PostgREST subset),
// backed by a real Postgres. Used only to drive the real UI in a browser for screenshots
// and smoke tests when no Supabase project is available. NOT for production.
//   TEST_DATABASE_URL=postgres://... node tests/e2e/mock-supabase.mjs
import { createHmac, randomUUID } from "node:crypto";
import http from "node:http";
import pg from "pg";

pg.types.setTypeParser(1700, Number);
pg.types.setTypeParser(20, Number);
pg.types.setTypeParser(1184, (v) => new Date(v.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")).toISOString().replace("Z", "+00:00"));

const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: "-c TimeZone=UTC" });
const PORT = Number(process.env.PORT || 54321);
const EMAIL = process.env.SEED_USER_EMAIL || "investor@trustvest.test";
const PASSWORD = process.env.SEED_USER_PASSWORD || "correct-horse-battery";
const USER = { id: "8d0c7e4a-6c55-4b3e-9a51-1f0f6c1b2a10", aud: "authenticated", role: "authenticated", email: EMAIL, app_metadata: {}, user_metadata: {}, created_at: "2026-10-01T00:00:00Z" };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function jwt(claims) {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64(claims);
  return `${head}.${body}.${createHmac("sha256", "test-secret").update(`${head}.${body}`).digest("base64url")}`;
}
function session() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return { access_token: jwt({ sub: USER.id, role: "authenticated", email: EMAIL, aud: "authenticated", exp, session_id: randomUUID() }), token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: randomUUID(), user: USER };
}

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
};
const readBody = (req) => new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => r(s ? JSON.parse(s) : {})); });
const ident = (s) => `"${s.replace(/"/g, "")}"`;
const roleOf = (req) => {
  const parts = (req.headers.authorization || "").split(".");
  if (parts.length !== 3) return "anon";
  try { return JSON.parse(Buffer.from(parts[1], "base64url")).role ?? "anon"; } catch { return "anon"; }
};
const isAuthed = (req) => roleOf(req) === "authenticated" || roleOf(req) === "service_role";

function filters(params, values) {
  const where = [];
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset", "columns"].includes(k)) continue;
    const [op, ...rest] = v.split(".");
    const val = rest.join(".");
    if (op === "eq") { values.push(val); where.push(`${ident(k)} = $${values.length}`); }
    else if (op === "in") { values.push(val.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, ""))); where.push(`${ident(k)}::text = any($${values.length})`); }
  }
  return where.length ? ` where ${where.join(" and ")}` : "";
}

console.log("service key:", jwt({ role: "service_role", iss: "mock" }));
console.log("anon key:", jwt({ role: "anon", iss: "mock" }));
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (req.method === "OPTIONS") return send(res, 204);
    // ---- Auth -------------------------------------------------------------
    if (url.pathname === "/auth/v1/token") {
      const body = await readBody(req);
      if (url.searchParams.get("grant_type") === "refresh_token") return send(res, 200, session());
      if (body.email === EMAIL && body.password === PASSWORD) return send(res, 200, session());
      return send(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
    }
    if (url.pathname === "/auth/v1/user") return isAuthed(req) ? send(res, 200, USER) : send(res, 401, { msg: "invalid JWT" });
    if (url.pathname === "/auth/v1/logout") return send(res, 204);

    // ---- PostgREST subset (read-only for the signed-in user, like the real RLS) ----
    const m = url.pathname.match(/^\/rest\/v1\/(.+)$/);
    if (m) {
      if (!isAuthed(req)) return send(res, 200, []); // anon sees nothing under RLS
      const table = m[1];
      const values = [];
      if (req.method !== "GET") {
        if (roleOf(req) !== "service_role") return send(res, 403, { message: "permission denied (read-only role)" });
        const body = await readBody(req);
        const one = (req.headers.accept || "").includes("vnd.pgrst.object");
        const reply = (rows) => (one ? send(res, rows.length === 1 ? 200 : 406, rows[0] ?? { code: "PGRST116" }) : send(res, 201, rows));
        const enc = (v) => (v !== null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : v);
        if (table.startsWith("rpc/")) {
          const names = Object.keys(body);
          const { rows } = await pool.query(`select * from public.${ident(table.slice(4))}(${names.map((n, i) => `${n} => $${i + 1}`).join(",")})`, names.map((n) => body[n]));
          return send(res, 200, rows[0] ?? null);
        }
        const entries = Object.entries(Array.isArray(body) ? body[0] : body);
        if (req.method === "POST") {
          const { rows } = await pool.query(`insert into public.${ident(table)} (${entries.map(([k]) => ident(k)).join(",")}) values (${entries.map((_, i) => `$${i + 1}`).join(",")}) returning *`, entries.map(([, v]) => enc(v)));
          return reply(rows);
        }
        if (req.method === "PATCH") {
          values.push(...entries.map(([, v]) => enc(v)));
          const sets = entries.map(([k], i) => `${ident(k)} = $${i + 1}`).join(",");
          const { rows } = await pool.query(`update public.${ident(table)} set ${sets}${filters(url.searchParams, values)} returning *`, values);
          return reply(rows);
        }
      }
      const select = url.searchParams.get("select") || "*";
      let sql = `select ${select === "*" ? "*" : select.split(",").map(ident).join(",")} from public.${ident(table)}${filters(url.searchParams, values)}`;
      const order = url.searchParams.get("order");
      if (order) sql += ` order by ${order.split(",").map((o) => { const [c, d] = o.split("."); return `${ident(c)} ${d === "desc" ? "desc" : "asc"}`; }).join(",")}`;
      if (url.searchParams.get("limit")) sql += ` limit ${Number(url.searchParams.get("limit"))}`;
      if (url.searchParams.get("offset")) sql += ` offset ${Number(url.searchParams.get("offset"))}`;
      const { rows } = await pool.query(sql, values);
      if ((req.headers.accept || "").includes("vnd.pgrst.object")) {
        return rows.length === 1 ? send(res, 200, rows[0]) : send(res, 406, { code: "PGRST116", message: `${rows.length} rows` });
      }
      return send(res, 200, rows, { "content-range": `0-${Math.max(rows.length - 1, 0)}/*` });
    }
    send(res, 404, { message: `mock: ${req.method} ${url.pathname} not implemented` });
  } catch (e) {
    send(res, e.code === "23505" ? 409 : 400, { message: e.message, code: e.code });
  }
}).listen(PORT, () => console.log(`mock supabase on :${PORT}`));
