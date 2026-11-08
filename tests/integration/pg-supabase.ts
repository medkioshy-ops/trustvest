// Minimal stand-in for the subset of the supabase-js query builder TrustVest uses,
// backed by a real Postgres connection. Lets the integration test exercise the real
// schema, constraints, triggers and SQL functions without a running Supabase stack.
import pg from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";

pg.types.setTypeParser(1700, (v) => Number(v)); // numeric → number (as PostgREST returns)
pg.types.setTypeParser(20, (v) => Number(v)); // int8
pg.types.setTypeParser(1184, (v) => new Date(v.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")).toISOString().replace("Z", "+00:00"));

type Result = { data: unknown; error: { message: string; code?: string } | null };

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" = "select";
  private cols = "*";
  private where: string[] = [];
  private params: unknown[] = [];
  private orderBy = "";
  private lim = "";
  private off = "";
  private values: Record<string, unknown> | null = null;
  private returning = false;
  private mode: "many" | "single" | "maybe" = "many";

  constructor(
    private pool: pg.Pool,
    private table: string,
  ) {}

  private p(v: unknown) {
    this.params.push(v !== null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : v);
    return `$${this.params.length}`;
  }
  select(cols = "*") {
    if (this.op === "select") this.cols = cols;
    else this.returning = true;
    return this;
  }
  insert(values: Record<string, unknown>) {
    this.op = "insert";
    this.values = values;
    return this;
  }
  update(values: Record<string, unknown>) {
    this.op = "update";
    this.values = values;
    return this;
  }
  eq(col: string, v: unknown) {
    this.where.push(`"${col}" = ${this.p(v)}`);
    return this;
  }
  in(col: string, vs: unknown[]) {
    this.where.push(`"${col}" = any(${this.p(vs)})`);
    return this;
  }
  order(col: string, o?: { ascending?: boolean }) {
    this.orderBy = ` order by "${col}" ${o?.ascending === false ? "desc" : "asc"}`;
    return this;
  }
  limit(n: number) {
    this.lim = ` limit ${n}`;
    return this;
  }
  range(from: number, to: number) {
    this.off = ` offset ${from}`;
    this.lim = ` limit ${to - from + 1}`;
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }
  maybeSingle() {
    this.mode = "maybe";
    return this;
  }

  private sql() {
    const t = `public."${this.table}"`;
    const w = this.where.length ? ` where ${this.where.join(" and ")}` : "";
    if (this.op === "select") return `select ${this.cols} from ${t}${w}${this.orderBy}${this.lim}${this.off}`;
    const entries = Object.entries(this.values!);
    if (this.op === "insert") {
      const cols = entries.map(([k]) => `"${k}"`).join(",");
      const vals = entries.map(([, v]) => this.p(v)).join(",");
      return `insert into ${t} (${cols}) values (${vals})${this.returning ? " returning *" : ""}`;
    }
    const sets = entries.map(([k, v]) => `"${k}" = ${this.p(v)}`).join(",");
    return `update ${t} set ${sets}${w}${this.returning ? " returning *" : ""}`;
  }

  async run(): Promise<Result> {
    try {
      const { rows } = await this.pool.query(this.sql(), this.params);
      if (this.mode === "single") {
        if (rows.length !== 1) return { data: null, error: { message: `expected 1 row, got ${rows.length}`, code: "PGRST116" } };
        return { data: rows[0], error: null };
      }
      if (this.mode === "maybe") return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    } catch (e) {
      const err = e as { message: string; code?: string };
      return { data: null, error: { message: err.message, code: err.code } };
    }
  }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((r: unknown) => B | PromiseLike<B>) | null) {
    return this.run().then(ok, bad);
  }
}

export function pgSupabase(pool: pg.Pool): SupabaseClient {
  return {
    from: (table: string) => new Query(pool, table),
    rpc: async (fn: string, args: Record<string, unknown>): Promise<Result> => {
      const names = Object.keys(args);
      const sql = `select * from public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")})`;
      try {
        const { rows } = await pool.query(sql, names.map((n) => args[n]));
        return { data: rows[0] ?? null, error: null };
      } catch (e) {
        const err = e as { message: string; code?: string };
        return { data: null, error: { message: err.message, code: err.code } };
      }
    },
  } as unknown as SupabaseClient;
}
