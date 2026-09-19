// Row inspection only. Aggregation belongs in sales_summary / breakdown / refund_report.
import { readFileSync } from "node:fs";
import { z } from "zod";

export const name = "query_orders";
export const description =
  "Inspect individual order rows (spot checks only). DO NOT use this to compute totals, rankings or trends - " +
  "it returns a TRUNCATED page of rows and adding them up by hand gives wrong answers. " +
  "For any number that goes into a report use sales_summary, breakdown or refund_report instead, which scan all 400 orders. " +
  "Supports offset paging and filters, and reports how many rows matched versus how many are shown.";

export const schema = {
  region: z.string().optional().describe("Filter by region"),
  category: z.string().optional().describe("Filter by category"),
  product: z.string().optional().describe("Filter by product"),
  customer_id: z.string().optional().describe("Filter by customer id, e.g. C007"),
  status: z.string().optional().describe("Filter by status: completed / refunded / cancelled"),
  month: z.string().optional().describe("Filter by month, YYYY-MM"),
  limit: z.number().int().min(1).max(200).optional().describe("Max rows to return (default 20)"),
  offset: z.number().int().min(0).optional().describe("Number of matching rows to skip (default 0)"),
};

export async function handler(args = {}) {
  const orders = JSON.parse(readFileSync(new URL("../data/orders.json", import.meta.url), "utf8"));
  const limit = args.limit ?? 20;
  const offset = args.offset ?? 0;

  const matched = orders.filter((o) => {
    if (args.region && o.region !== args.region) return false;
    if (args.category && o.category !== args.category) return false;
    if (args.product && o.product !== args.product) return false;
    if (args.customer_id && o.customer_id !== args.customer_id) return false;
    if (args.status && o.status !== args.status) return false;
    if (args.month && o.date.slice(0, 7) !== args.month) return false;
    return true;
  });

  const page = matched.slice(offset, offset + limit).map((o) => ({ ...o, revenue: o.quantity * o.unit_price }));
  const shownTo = offset + page.length;
  const note =
    shownTo < matched.length
      ? `TRUNCATED: showing rows ${offset + 1}-${shownTo} of ${matched.length} matches. Do NOT aggregate this partial page - use breakdown or sales_summary.`
      : `Showing all ${matched.length} matching rows.`;

  return {
    content: [{ type: "text", text: `${note}\n${JSON.stringify(page)}` }],
  };
}
