// Two-dimension aggregation: for each group, rank its sub-groups by net revenue.
import { readFileSync } from "node:fs";
import { z } from "zod";

export const name = "cross_breakdown";
export const description =
  "Two-dimension aggregation over ALL 400 orders: for every value of group_by, ranks the values of sub_group_by " +
  "by NET revenue (completed orders only) and prints the top ones plus an explicit TOP line. " +
  "Use it for questions like 'top category and top product in each region'. " +
  "Scans the whole file, no row cap. Numbers are pre-rounded to 2 decimals - copy them verbatim.";

export const schema = {
  group_by: z.enum(["region", "category", "product", "customer", "month"]).describe("Outer dimension, e.g. region"),
  sub_group_by: z.enum(["region", "category", "product", "customer", "month"]).describe("Inner dimension to rank, e.g. category"),
  top_n: z.number().int().min(1).optional().describe("How many sub-groups to list per group, default 3"),
  status: z.enum(["completed", "refunded", "cancelled", "all"]).optional()
    .describe("Which orders to sum. Default 'completed' (= NET revenue)"),
};

const rev = (o) => o.quantity * o.unit_price;
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const fmt = (n) => (Number.isFinite(n) ? String(r2(n)) : "n/a");
const KEY = {
  region: (o) => o.region,
  category: (o) => o.category,
  product: (o) => o.product,
  customer: (o) => o.customer_id,
  month: (o) => o.date.slice(0, 7),
};

export async function handler(args = {}) {
  const gb = args.group_by, sb = args.sub_group_by;
  if (!KEY[gb] || !KEY[sb]) return { content: [{ type: "text", text: `ERROR: group_by/sub_group_by must be one of ${Object.keys(KEY).join(", ")}` }], isError: true };
  const topN = args.top_n || 3;
  const status = args.status || "completed";

  const all = JSON.parse(readFileSync(new URL("../data/orders.json", import.meta.url), "utf8"));
  const orders = status === "all" ? all : all.filter((o) => o.status === status);

  const g = new Map();
  for (const o of orders) {
    const k = KEY[gb](o), s = KEY[sb](o);
    if (!g.has(k)) g.set(k, new Map());
    const m = g.get(k);
    if (!m.has(s)) m.set(s, { name: s, revenue: 0, orders: 0, units: 0 });
    const e = m.get(s);
    e.revenue += rev(o); e.orders += 1; e.units += o.quantity;
  }

  const L = [];
  L.push(`CROSS BREAKDOWN: ${gb} x ${sb} | status=${status} (${status === "completed" ? "NET revenue" : status + " orders"})`);
  const keys = [...g.keys()].sort();
  for (const k of keys) {
    const rows = [...g.get(k).values()].sort((a, b) => b.revenue - a.revenue || (a.name < b.name ? -1 : 1));
    L.push(`${k}:`);
    rows.slice(0, topN).forEach((e, i) => {
      L.push(`   ${i + 1}. ${e.name}: revenue=${fmt(e.revenue)}, orders=${e.orders}, units=${e.units}`);
    });
    L.push(`   TOP_${sb.toUpperCase()}: ${rows[0].name} (${fmt(rows[0].revenue)})`);
  }
  L.push(`--- ONE-LINE-PER-${gb.toUpperCase()} (alphabetical) ---`);
  for (const k of keys) {
    const rows = [...g.get(k).values()].sort((a, b) => b.revenue - a.revenue || (a.name < b.name ? -1 : 1));
    L.push(`${k}: top_${sb}=${rows[0].name} (${fmt(rows[0].revenue)})`);
  }
  return { content: [{ type: "text", text: L.join("\n") }] };
}
