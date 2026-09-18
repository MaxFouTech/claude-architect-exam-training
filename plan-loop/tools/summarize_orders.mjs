// Whole-dataset headline summary: status mix, gross/net revenue, AOV, units.
import { readFileSync } from "node:fs";
import { z } from "zod";

export const name = "summarize_orders";
export const description =
  "Headline totals for the WHOLE sales dataset (all 400 orders, Jan-Jun 2026) in one call. " +
  "Returns: total order count, per-status counts (completed/refunded/cancelled), GROSS revenue (all statuses), " +
  "NET revenue (completed only), AOV (net revenue / completed orders), units completed, units all, " +
  "distinct customers/products/regions and the date range. Optional filters narrow the scope. " +
  "All revenue = quantity * unit_price, summed by the tool. Use this for any 'overall totals' question - " +
  "never count rows yourself.";
export const schema = {
  region: z.string().optional().describe("Optional region filter, e.g. EMEA"),
  category: z.string().optional().describe("Optional category filter, e.g. hardware"),
  product: z.string().optional().describe("Optional product filter, e.g. 'Laptop Pro'"),
  customer_id: z.string().optional().describe("Optional customer filter, e.g. C012"),
  month: z.string().optional().describe("Optional month filter 'YYYY-MM', e.g. 2026-03"),
};

const r2 = (n) => Math.round(n * 100) / 100;

export async function handler(args = {}) {
  const orders = JSON.parse(readFileSync(new URL("../data/orders.json", import.meta.url), "utf8"));
  const rows = orders.filter(
    (o) =>
      (!args.region || o.region === args.region) &&
      (!args.category || o.category === args.category) &&
      (!args.product || o.product === args.product) &&
      (!args.customer_id || o.customer_id === args.customer_id) &&
      (!args.month || o.date.slice(0, 7) === args.month)
  );
  if (rows.length === 0) {
    return { content: [{ type: "text", text: "No orders match those filters." }], isError: true };
  }
  const rev = (o) => o.quantity * o.unit_price;
  const byStatus = { completed: 0, refunded: 0, cancelled: 0 };
  const revStatus = { completed: 0, refunded: 0, cancelled: 0 };
  let gross = 0, unitsAll = 0, unitsCompleted = 0;
  for (const o of rows) {
    byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    revStatus[o.status] = (revStatus[o.status] || 0) + rev(o);
    gross += rev(o);
    unitsAll += o.quantity;
    if (o.status === "completed") unitsCompleted += o.quantity;
  }
  const net = revStatus.completed;
  const dates = rows.map((o) => o.date).sort();
  const out = [
    `SCOPE: ${rows.length} orders, ${dates[0]} .. ${dates[dates.length - 1]}`,
    `TOTAL_ORDERS: ${rows.length}`,
    `COMPLETED: ${byStatus.completed}`,
    `REFUNDED: ${byStatus.refunded}`,
    `CANCELLED: ${byStatus.cancelled}`,
    `GROSS_REVENUE: ${r2(gross)}   (all statuses)`,
    `NET_REVENUE: ${r2(net)}   (completed only)`,
    `REFUNDED_REVENUE: ${r2(revStatus.refunded)}`,
    `CANCELLED_REVENUE: ${r2(revStatus.cancelled)}`,
    `AOV: ${r2(net / byStatus.completed)}   (net revenue / completed orders)`,
    `UNITS_COMPLETED: ${unitsCompleted}`,
    `UNITS_ALL: ${unitsAll}`,
    `REFUND_RATE: ${r2((byStatus.refunded / rows.length) * 100)}%   (refunded orders / all orders)`,
    `DISTINCT_CUSTOMERS: ${new Set(rows.map((o) => o.customer_id)).size}`,
    `DISTINCT_PRODUCTS: ${new Set(rows.map((o) => o.product)).size}`,
    `DISTINCT_REGIONS: ${new Set(rows.map((o) => o.region)).size}`,
  ];
  return { content: [{ type: "text", text: out.join("\n") }] };
}
