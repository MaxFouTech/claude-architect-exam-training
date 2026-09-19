// General one-dimension aggregation over every order. Replaces raw-row browsing.
import { readFileSync } from "node:fs";
import { z } from "zod";

export const name = "breakdown";
export const description =
  "Aggregate ALL 400 orders grouped by one dimension: region, category, product, customer or month. " +
  "Scans the whole file every time - there is no row cap and nothing to paginate. " +
  "Each row prints: revenue (NET, completed orders only), orders (completed count), units, aov, share (% of net revenue), " +
  "then all-status columns total_orders, refunded, rate (refund rate %), refunded_revenue. " +
  "When group_by=month rows come out chronologically with a mom (month-over-month %) column. " +
  "Below the rows a SUMMARY block gives TOTAL, LEADER, LOWEST, MOST_UNITS, BEST/WORST month and TOP_N_SHARE. " +
  "All numbers are pre-rounded to 2 decimals - copy them verbatim, never re-round or pad them. " +
  "Use limit to show a top-N (summary lines are still computed over every group).";

export const schema = {
  group_by: z.enum(["region", "category", "product", "customer", "month", "status"])
    .describe("Dimension to group by"),
  sort_by: z.enum(["revenue", "orders", "units", "aov", "rate", "refunded_revenue", "name"])
    .optional().describe("Sort key. Default: revenue (or chronological for month)"),
  order: z.enum(["desc", "asc"]).optional().describe("Sort direction, default desc"),
  limit: z.number().int().min(1).optional().describe("Show only the first N rows after sorting"),
  region: z.string().optional().describe("Restrict to this region"),
  category: z.string().optional().describe("Restrict to this category"),
  product: z.string().optional().describe("Restrict to this product"),
  customer: z.string().optional().describe("Restrict to this customer_id"),
  month: z.string().optional().describe("Restrict to this month, YYYY-MM"),
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
  status: (o) => o.status,
};

export async function handler(args = {}) {
  const gb = args.group_by;
  if (!KEY[gb]) return { content: [{ type: "text", text: `ERROR: group_by must be one of ${Object.keys(KEY).join(", ")}` }], isError: true };

  const all = JSON.parse(readFileSync(new URL("../data/orders.json", import.meta.url), "utf8"));
  const orders = all.filter(
    (o) =>
      (!args.region || o.region === args.region) &&
      (!args.category || o.category === args.category) &&
      (!args.product || o.product === args.product) &&
      (!args.customer || o.customer_id === args.customer) &&
      (!args.month || o.date.slice(0, 7) === args.month)
  );

  const g = new Map();
  for (const o of orders) {
    const k = KEY[gb](o);
    if (!g.has(k)) g.set(k, { name: k, revenue: 0, orders: 0, units: 0, total_orders: 0, refunded: 0, refunded_revenue: 0 });
    const e = g.get(k);
    e.total_orders += 1;
    if (o.status === "completed") { e.revenue += rev(o); e.orders += 1; e.units += o.quantity; }
    if (o.status === "refunded") { e.refunded += 1; e.refunded_revenue += rev(o); }
  }
  let rows = [...g.values()];
  for (const e of rows) {
    e.aov = e.orders ? e.revenue / e.orders : NaN;
    e.rate = e.total_orders ? (e.refunded / e.total_orders) * 100 : NaN;
  }

  const grandNet = rows.reduce((a, e) => a + e.revenue, 0);
  for (const e of rows) e.share = grandNet ? (e.revenue / grandNet) * 100 : NaN;

  // chronological copy for month-over-month, independent of the display sort
  if (gb === "month") {
    const chron = [...rows].sort((a, b) => (a.name < b.name ? -1 : 1));
    chron.forEach((e, i) => {
      const prev = i > 0 ? chron[i - 1].revenue : null;
      e.mom = i === 0 || !prev ? NaN : ((e.revenue - prev) / prev) * 100;
    });
  }

  const sortBy = args.sort_by || (gb === "month" ? "name" : "revenue");
  const dir = (args.order || (sortBy === "name" ? "asc" : "desc")) === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    if (sortBy === "name") return a.name < b.name ? -dir : a.name > b.name ? dir : 0;
    const x = a[sortBy], y = b[sortBy];
    const xa = Number.isFinite(x) ? x : -Infinity, ya = Number.isFinite(y) ? y : -Infinity;
    return xa === ya ? (a.name < b.name ? -1 : 1) : (xa < ya ? -dir : dir);
  });

  const full = rows;
  const shown = args.limit ? rows.slice(0, args.limit) : rows;

  const L = [];
  const scope = ["region", "category", "product", "customer", "month"].filter((k) => args[k]).map((k) => `${k}=${args[k]}`).join(", ");
  L.push(`BREAKDOWN by ${gb}${scope ? ` (filtered: ${scope})` : ""} | ${full.length} groups, ${orders.length} orders scanned`);
  L.push(`sorted by ${sortBy} ${dir === 1 ? "asc" : "desc"}${args.limit ? `, showing top ${shown.length}` : ""}`);
  shown.forEach((e, i) => {
    const mom = gb === "month" ? `, mom=${Number.isFinite(e.mom) ? fmt(e.mom) + "%" : "n/a"}` : "";
    L.push(
      `${i + 1}. ${e.name}: revenue=${fmt(e.revenue)}, orders=${e.orders}, units=${e.units}, aov=${fmt(e.aov)}, share=${fmt(e.share)}%${mom}` +
      ` | total_orders=${e.total_orders}, refunded=${e.refunded}, rate=${fmt(e.rate)}%, refunded_revenue=${fmt(e.refunded_revenue)}`
    );
  });

  L.push("--- SUMMARY (over all groups, not just the shown ones) ---");
  L.push(`TOTAL_NET_REVENUE: ${fmt(grandNet)}`);
  L.push(`TOTAL_COMPLETED_ORDERS: ${full.reduce((a, e) => a + e.orders, 0)}`);
  L.push(`TOTAL_ORDERS_ALL_STATUSES: ${orders.length}`);
  const byRev = [...full].sort((a, b) => b.revenue - a.revenue);
  L.push(`LEADER (highest revenue): ${byRev[0].name} (${fmt(byRev[0].revenue)})`);
  L.push(`LOWEST (lowest revenue): ${byRev[byRev.length - 1].name} (${fmt(byRev[byRev.length - 1].revenue)})`);
  const byUnits = [...full].sort((a, b) => b.units - a.units);
  L.push(`MOST_UNITS: ${byUnits[0].name} (${byUnits[0].units} units)`);
  const byRate = [...full].sort((a, b) => (b.rate || 0) - (a.rate || 0));
  L.push(`HIGHEST_REFUND_RATE: ${byRate[0].name} (${fmt(byRate[0].rate)}%)`);
  if (gb === "month") {
    L.push(`BEST_MONTH: ${byRev[0].name}`);
    L.push(`WORST_MONTH: ${byRev[byRev.length - 1].name}`);
  }
  if (args.limit) {
    const part = shown.reduce((a, e) => a + e.revenue, 0);
    L.push(`TOP_${shown.length}_SHARE: ${fmt(grandNet ? (part / grandNet) * 100 : NaN)}%`);
  }
  L.push(`REVENUE_LIST (desc): ${byRev.map((e) => `${e.name}=${fmt(e.revenue)}`).join(", ")}`);

  return { content: [{ type: "text", text: L.join("\n") }] };
}
