// Raw row inspection only. Aggregates must go through breakdown_orders / summarize_orders.
import { readFileSync } from "node:fs";
import { z } from "zod";

export const name = "query_orders";
export const description =
  "Inspect INDIVIDUAL order rows (spot-checks, sanity checks, looking up one order). " +
  "Always reports how many rows matched before truncation, and supports offset paging. " +
  "DO NOT use this to compute totals, rankings or rates - you would have to add rows up by hand and the row list is " +
  "truncated. Use summarize_orders for overall totals, breakdown_orders for any grouping/ranking, " +
  "and refund_report for refund rates.";
export const schema = {
  region: z.string().optional().describe("Filter by region"),
  category: z.string().optional().describe("Filter by category"),
  product: z.string().optional().describe("Filter by product"),
  customer_id: z.string().optional().describe("Filter by customer"),
  status: z.string().optional().describe("Filter by status: completed, refunded or cancelled"),
  month: z.string().optional().describe("Filter by month 'YYYY-MM'"),
  limit: z.number().int().min(1).max(100).optional().describe("Max rows to return, default 20"),
  offset: z.number().int().min(0).optional().describe("Skip this many matching rows first, default 0"),
};

export async function handler(args = {}) {
  const orders = JSON.parse(readFileSync(new URL("../data/orders.json", import.meta.url), "utf8"));
  const matched = orders.filter(
    (o) =>
      (!args.region || o.region === args.region) &&
      (!args.category || o.category === args.category) &&
      (!args.product || o.product === args.product) &&
      (!args.customer_id || o.customer_id === args.customer_id) &&
      (!args.status || o.status === args.status) &&
      (!args.month || o.date.slice(0, 7) === args.month)
  );
  const offset = args.offset || 0;
  const limit = args.limit || 20;
  const page = matched.slice(offset, offset + limit).map((o) => ({ ...o, revenue: o.quantity * o.unit_price }));
  const header =
    `MATCHED_ROWS: ${matched.length} (showing ${page.length}, offset ${offset}). ` +
    `This is a truncated sample - do not aggregate it by hand; use breakdown_orders or summarize_orders.`;
  return { content: [{ type: "text", text: header + "\n" + JSON.stringify(page) }] };
}
