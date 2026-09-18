// Refund-rate analysis: needs an all-status denominator, so it is its own tool.
import { readFileSync } from "node:fs";
import { z } from "zod";

export const name = "refund_report";
export const description =
  "Refund behaviour broken down by any dimension, computed over ALL orders (all statuses) so the rates are correct. " +
  "For every group returns: total orders (all statuses), completed / refunded / cancelled counts, " +
  "refund rate % = refunded orders / total orders in that group * 100, and refunded revenue (quantity*unit_price of refunded orders). " +
  "Groups are ranked by refund rate descending by default. Always ends with OVERALL lines covering the whole scope. " +
  "Use this for every refund-rate or refund-revenue question - do NOT use breakdown_orders, which filters by status and " +
  "therefore cannot give you an all-status denominator.";
export const schema = {
  group_by: z
    .enum(["category", "region", "product", "customer_id", "month", "quarter", "status", "none"])
    .describe("Dimension to break refunds down by. Use 'none' for the overall figures only."),
  sort_by: z.enum(["rate", "refunded_revenue", "refunded", "orders", "key"]).optional()
    .describe("Ranking key, default 'rate' (highest refund rate first). 'key' sorts alphabetically/chronologically."),
  top: z.number().int().min(1).max(100).optional().describe("Keep only the first N groups after sorting. Default: all."),
  region: z.string().optional().describe("Optional region filter applied before grouping"),
  category: z.string().optional().describe("Optional category filter applied before grouping"),
};

const r2 = (n) => Math.round(n * 100) / 100;
const keyOf = (o, dim) =>
  dim === "month" ? o.date.slice(0, 7)
    : dim === "quarter" ? (Number(o.date.slice(5, 7)) <= 3 ? "Q1" : "Q2")
      : o[dim];

export async function handler(args) {
  const orders = JSON.parse(readFileSync(new URL("../data/orders.json", import.meta.url), "utf8"));
  const dim = args.group_by;
  const sortBy = args.sort_by || "rate";
  const rev = (o) => o.quantity * o.unit_price;

  const rows = orders.filter(
    (o) => (!args.region || o.region === args.region) && (!args.category || o.category === args.category)
  );
  if (rows.length === 0) {
    return { content: [{ type: "text", text: "No orders match those filters." }], isError: true };
  }

  const overall = {
    orders: rows.length,
    refunded: rows.filter((o) => o.status === "refunded").length,
    refundedRevenue: rows.filter((o) => o.status === "refunded").reduce((a, o) => a + rev(o), 0),
    grossRevenue: rows.reduce((a, o) => a + rev(o), 0),
  };

  const lines = [];
  if (dim !== "none") {
    const g = new Map();
    for (const o of rows) {
      const k = keyOf(o, dim);
      if (!g.has(k)) g.set(k, { key: k, orders: 0, completed: 0, refunded: 0, cancelled: 0, refundedRevenue: 0 });
      const e = g.get(k);
      e.orders++;
      e[o.status]++;
      if (o.status === "refunded") e.refundedRevenue += rev(o);
    }
    let list = [...g.values()].map((e) => ({ ...e, rate: (e.refunded / e.orders) * 100 }));
    list.sort((a, b) =>
      sortBy === "key" ? String(a.key).localeCompare(String(b.key)) : b[sortBy] - a[sortBy] || String(a.key).localeCompare(String(b.key))
    );
    if (args.top) list = list.slice(0, args.top);
    lines.push(`REFUNDS BY ${dim.toUpperCase()} (ranked by ${sortBy} desc, denominators are ALL statuses)`);
    list.forEach((e, i) => {
      lines.push(
        `${i + 1}. ${e.key}: orders=${e.orders}, refunded=${e.refunded}, rate=${r2(e.rate)}%, ` +
        `refunded_revenue=${r2(e.refundedRevenue)}, completed=${e.completed}, cancelled=${e.cancelled}`
      );
    });
    lines.push("");
  }
  lines.push(`OVERALL_ORDERS: ${overall.orders}`);
  lines.push(`OVERALL_REFUNDED_ORDERS: ${overall.refunded}`);
  lines.push(`OVERALL_REFUND_RATE: ${r2((overall.refunded / overall.orders) * 100)}%`);
  lines.push(`TOTAL_REFUNDED_REVENUE: ${r2(overall.refundedRevenue)}`);
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
