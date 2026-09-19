import { z } from "zod";
import { loadOrders, applyFilters, describeFilters, statsFor, fmt, text, fail, DIMENSIONS } from "./_shared.mjs";

export const name = "refund_report";
export const description =
  "Refund analysis over all 400 orders, grouped by any dimension (category, region, product, customer_id, month, quarter). " +
  "No row cap. Refund rate is ALWAYS refunded orders / TOTAL orders in that group counting every status, times 100 - " +
  "the tool applies that definition for you. Each line prints: orders (total, all statuses), refunded (count), " +
  "rate=<x>% and refunded_revenue. Rows are ranked by refund rate descending by default. " +
  "Footer lines give OVERALL_ORDERS, OVERALL_REFUNDED, OVERALL_REFUND_RATE, TOTAL_REFUNDED_REVENUE, " +
  "WORST_GROUP (highest rate) and BEST_GROUP (lowest rate). " +
  "Copy the printed numbers verbatim; never re-round and never count raw order rows yourself.";

export const schema = {
  group_by: z
    .enum(["category", "region", "product", "customer_id", "month", "quarter", "status"])
    .describe("Dimension to group refunds by. Required."),
  sort: z
    .enum(["rate_desc", "rate_asc", "refunded_revenue_desc", "key_asc"])
    .optional()
    .describe("Row order. Default 'rate_desc' (highest refund rate first)."),
  limit: z.number().int().min(1).optional().describe("Show only the first N rows. Footers still cover ALL groups."),
  region: z.string().optional().describe("Filter to one region before grouping"),
  category: z.string().optional().describe("Filter to one category before grouping"),
  product: z.string().optional().describe("Filter to one product before grouping"),
  date_from: z.string().optional().describe("Inclusive start date YYYY-MM-DD"),
  date_to: z.string().optional().describe("Inclusive end date YYYY-MM-DD"),
};

export async function handler(args = {}) {
  const dim = args.group_by;
  if (!dim || !DIMENSIONS[dim]) {
    return fail(`group_by must be one of: category, region, product, customer_id, month, quarter, status. Got: ${JSON.stringify(args.group_by)}`);
  }
  const keyOf = DIMENSIONS[dim];
  const rows = applyFilters(loadOrders(), args);
  if (!rows.length) return fail(`No orders match those filters (${describeFilters(args)}).`);

  const buckets = new Map();
  for (const o of rows) {
    const k = keyOf(o);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(o);
  }
  let groups = [...buckets.entries()].map(([key, rs]) => ({ key, ...statsFor(rs) }));

  const sorters = {
    rate_desc: (a, b) => b.refund_rate - a.refund_rate,
    rate_asc: (a, b) => a.refund_rate - b.refund_rate,
    refunded_revenue_desc: (a, b) => b.refunded_revenue - a.refunded_revenue,
    key_asc: (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  };
  const sort = args.sort || "rate_desc";
  groups.sort(sorters[sort]);

  const shown = args.limit ? groups.slice(0, args.limit) : groups;
  const overall = statsFor(rows);

  const lines = [`REFUND REPORT by ${dim} (filters: ${describeFilters(args)}; sorted ${sort}; ${groups.length} groups)`];
  shown.forEach((g, i) => {
    lines.push(
      `${i + 1}. ${g.key}: orders=${g.total_orders}, refunded=${g.refunded_orders}, ` +
        `rate=${fmt(g.refund_rate)}%, refunded_revenue=${fmt(g.refunded_revenue)}`
    );
  });

  const byRate = [...groups].sort((a, b) => b.refund_rate - a.refund_rate);
  lines.push(`OVERALL_ORDERS: ${overall.total_orders}`);
  lines.push(`OVERALL_REFUNDED: ${overall.refunded_orders}`);
  lines.push(`OVERALL_REFUND_RATE: ${fmt(overall.refund_rate)}%`);
  lines.push(`TOTAL_REFUNDED_REVENUE: ${fmt(overall.refunded_revenue)}`);
  lines.push(`WORST_GROUP: ${byRate[0].key} (${fmt(byRate[0].refund_rate)}%)`);
  lines.push(`BEST_GROUP: ${byRate[byRate.length - 1].key} (${fmt(byRate[byRate.length - 1].refund_rate)}%)`);
  return text(lines.join("\n"));
}
