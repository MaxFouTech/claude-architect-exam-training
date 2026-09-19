// Headline totals for the whole file (or a filtered slice). No row caps.
import { readFileSync } from "node:fs";
import { z } from "zod";

export const name = "sales_overview";
export const description =
  "Headline half-year totals computed over ALL 400 orders (no row cap, nothing to page through). " +
  "Returns TOTAL_ORDERS, COMPLETED, REFUNDED, CANCELLED, GROSS_REVENUE (all statuses), NET_REVENUE (completed only), " +
  "AOV (net/completed orders), UNITS_COMPLETED, OVERALL_REFUND_RATE, TOTAL_REFUNDED_REVENUE, " +
  "Q1_NET_REVENUE, Q2_NET_REVENUE and Q1_TO_Q2_CHANGE. Every number is already rounded to 2 decimals: copy it verbatim. " +
  "Optional filters narrow the slice; call with no arguments for the whole Jan-Jun 2026 file.";

export const schema = {
  region: z.string().optional().describe("Only count this region, e.g. APAC"),
  category: z.string().optional().describe("Only count this category, e.g. hardware"),
  product: z.string().optional().describe("Only count this product, e.g. 'Laptop Pro'"),
  customer: z.string().optional().describe("Only count this customer_id, e.g. C007"),
  month: z.string().optional().describe("Only count this month, YYYY-MM e.g. 2026-03"),
};

const rev = (o) => o.quantity * o.unit_price;
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const fmt = (n) => (Number.isFinite(n) ? String(r2(n)) : "n/a");

export async function handler(args = {}) {
  const all = JSON.parse(readFileSync(new URL("../data/orders.json", import.meta.url), "utf8"));
  const orders = all.filter(
    (o) =>
      (!args.region || o.region === args.region) &&
      (!args.category || o.category === args.category) &&
      (!args.product || o.product === args.product) &&
      (!args.customer || o.customer_id === args.customer) &&
      (!args.month || o.date.slice(0, 7) === args.month)
  );

  const by = (s) => orders.filter((o) => o.status === s);
  const completed = by("completed");
  const refunded = by("refunded");
  const cancelled = by("cancelled");
  const sum = (a, f) => a.reduce((x, o) => x + f(o), 0);

  const gross = sum(orders, rev);
  const net = sum(completed, rev);
  const q = (months) => sum(completed.filter((o) => months.includes(o.date.slice(0, 7))), rev);
  const q1 = q(["2026-01", "2026-02", "2026-03"]);
  const q2 = q(["2026-04", "2026-05", "2026-06"]);

  const L = [];
  const scope = Object.entries(args).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(", ");
  L.push(`SCOPE: ${scope || "all orders, Jan-Jun 2026"}`);
  L.push(`TOTAL_ORDERS: ${orders.length}`);
  L.push(`COMPLETED: ${completed.length}`);
  L.push(`REFUNDED: ${refunded.length}`);
  L.push(`CANCELLED: ${cancelled.length}`);
  L.push(`GROSS_REVENUE: ${fmt(gross)}`);
  L.push(`NET_REVENUE: ${fmt(net)}`);
  L.push(`AOV: ${fmt(completed.length ? net / completed.length : NaN)}`);
  L.push(`UNITS_COMPLETED: ${sum(completed, (o) => o.quantity)}`);
  L.push(`UNITS_ALL_STATUSES: ${sum(orders, (o) => o.quantity)}`);
  L.push(`OVERALL_REFUND_RATE: ${fmt(orders.length ? (refunded.length / orders.length) * 100 : NaN)}%`);
  L.push(`TOTAL_REFUNDED_REVENUE: ${fmt(sum(refunded, rev))}`);
  L.push(`Q1_NET_REVENUE: ${fmt(q1)}`);
  L.push(`Q2_NET_REVENUE: ${fmt(q2)}`);
  L.push(`Q1_TO_Q2_CHANGE: ${fmt(q1 ? ((q2 - q1) / q1) * 100 : NaN)}%`);

  return { content: [{ type: "text", text: L.join("\n") }] };
}
