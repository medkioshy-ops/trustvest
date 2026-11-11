// Quick route smoke test against a running dev server (default http://localhost:3000).

const base = process.env.SPOT_CHECK_URL || "http://localhost:3000";
const routes = ["/", "/login", "/join", "/dashboard", "/decisions", "/ledger"];

const results = [];
for (const route of routes) {
  try {
    const res = await fetch(`${base}${route}`, { redirect: "manual" });
    results.push({ route, status: res.status, location: res.headers.get("location") || "" });
  } catch (e) {
    results.push({ route, status: "ERR", location: String(e?.message || e) });
  }
}
console.log(JSON.stringify({ base, results }, null, 2));
