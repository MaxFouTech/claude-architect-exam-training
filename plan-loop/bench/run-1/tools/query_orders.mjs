import { z } from "zod";
import { loadOrders, applyFilters, describeFilters, revenueOf, fmt, text } from "./_shared.mjs";

export const name = "query_orders";
export const description =
  "INSPECTION ONLY - returns individual raw order rows for spot-checking. " +
  "DO NOT use this to answer totals, rankings, shares, trends or refund rates: it is paginated and you would be " +
  "aggregating a partial sample by hand, which produces wrong answers. " +
  "For any number you have to report, use summarize_orders, breakdown_orders or refund_report instead - " +
  "those read all 400 orders in a single call and do the maths for you. " +
  "Supports filters plus offset/limit pagination, and always tells you MATCHED (the full match count) so you can " +
  "see how much you are not looking at.";

export const schema = {
  region: z.string().optional().describe("Filter to one region"),
  category: z.string().optional().describe("Filter to one category"),
  product: z.string().optional().describe("Filter to one product"),
  customer_id: z.string().optional().describe("Filter to one customer"),
  status: z.string().optional().describe("Filter to one status: completed, refunded, cancelled"),
  month: z.string().optional().describe("Filter to one month YYYY-MM"),
  date_from: z.string().optional().describe("Inclusive start date YYYY-MM-DD"),
  date_to: z.string().optional().describe("Inclusive end date YYYY-MM-DD"),
  offset: z.number().int().min(0).optional().describe("Rows to skip for pagination. Default 0."),
  limit: z.number().int().min(1).max(200).optional().describe("Max rows to return. Default 20, max 200."),
};

export async function handler(args = {}) {
  const matched = applyFilters(loadOrders(), args);
  const offset = args.offset ?? 0;
  const limit = args.limit ?? 20;
  const page = matched.slice(offset, offset + limit);
  const totalRev = matched.reduce((a, o) => a + revenueOf(o), 0);

  const lines = [
    `RAW ROWS (filters: ${describeFilters(args)})`,
    `MATCHED: ${matched.length} orders total; showing ${page.length} (offset ${offset}).`,
    `Revenue of ALL ${matched.length} matched rows = ${fmt(totalRev)} (use the aggregator tools for any reported figure).`,
    ...page.map(
      (o) =>
        `${o.order_id} ${o.date} ${o.region} ${o.customer_id} "${o.product}" ${o.category} ` +
        `qty=${o.quantity} price=${o.unit_price} revenue=${fmt(revenueOf(o))} ${o.status}`
    ),
  ];
  if (offset + page.length < matched.length) {
    lines.push(`...${matched.length - offset - page.length} more rows not shown. Do NOT hand-total a partial page.`);
  }
  return text(lines.join("\n"));
}
