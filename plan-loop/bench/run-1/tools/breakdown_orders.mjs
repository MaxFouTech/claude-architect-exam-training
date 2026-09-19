import { z } from "zod";
import { loadOrders, applyFilters, describeFilters, statsFor, fmt, text, fail, DIMENSIONS } from "./_shared.mjs";

export const name = "breakdown_orders";
export const description =
  "THE MAIN AGGREGATOR. Groups every one of the 400 orders by one dimension and returns a fully computed, " +
  "already-ranked, already-rounded table. No row cap, no pagination: one call covers the whole file. " +
  "group_by accepts: region, category, product, customer_id, month, quarter, status. " +
  "Each line reports revenue (NET = status=='completed' only), orders (completed count), units, " +
  "aov (net/completed), share (% of total net revenue across ALL groups) and total_orders (all statuses). " +
  "For group_by='month' each line also carries mom=<x>% (month-over-month change vs the previous month, " +
  "'n/a' for the first); for group_by='quarter' it carries change=<x>%. " +
  "Footer lines give TOTAL_NET_REVENUE, HIGHEST_REVENUE, LOWEST_REVENUE, HIGHEST_UNITS, BEST_PERIOD/WORST_PERIOD " +
  "and, when you pass limit, TOP_<n>_SHARE (combined share of the rows shown). " +
  "Combine with the filters to slice first, e.g. group_by='product' + region='APAC' gives that region's top product. " +
  "Copy the printed numbers verbatim; never re-round and never add up raw order rows yourself.";

export const schema = {
  group_by: z
    .enum(["region", "category", "product", "customer_id", "month", "quarter", "status"])
    .describe("Dimension to group by. Required."),
  sort: z
    .enum(["revenue_desc", "revenue_asc", "units_desc", "orders_desc", "key_asc"])
    .optional()
    .describe(
      "Row order. Default 'revenue_desc', except month/quarter which default to 'key_asc' (chronological). " +
        "Use 'units_desc' to find the product with the most units."
    ),
  limit: z.number().int().min(1).optional().describe("Show only the first N rows (e.g. 5 for a top-5). Footers still cover ALL groups."),
  region: z.string().optional().describe("Filter to one region before grouping"),
  category: z.string().optional().describe("Filter to one category before grouping"),
  product: z.string().optional().describe("Filter to one product before grouping"),
  customer_id: z.string().optional().describe("Filter to one customer before grouping"),
  month: z.string().optional().describe("Filter to one month YYYY-MM before grouping"),
  quarter: z.string().optional().describe("Filter to one quarter '2026-Q1'/'2026-Q2' before grouping"),
  date_from: z.string().optional().describe("Inclusive start date YYYY-MM-DD"),
  date_to: z.string().optional().describe("Inclusive end date YYYY-MM-DD"),
};

export async function handler(args = {}) {
  const dim = args.group_by;
  if (!dim || !DIMENSIONS[dim]) {
    return fail(`group_by must be one of: ${Object.keys(DIMENSIONS).join(", ")}. Got: ${JSON.stringify(args.group_by)}`);
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
  const totalNet = groups.reduce((a, g) => a + g.net_revenue, 0);
  for (const g of groups) g.share = totalNet ? (g.net_revenue / totalNet) * 100 : 0;

  const isPeriod = dim === "month" || dim === "quarter";

  // Chronological pass first, so period-over-period change is always correct
  // regardless of how the caller later chooses to sort the display.
  if (isPeriod) {
    const chrono = [...groups].sort((a, b) => (a.key < b.key ? -1 : 1));
    chrono.forEach((g, i) => {
      const prev = i > 0 ? chrono[i - 1].net_revenue : null;
      g.change = i > 0 && prev ? ((g.net_revenue - prev) / prev) * 100 : null;
    });
  }

  const sort = args.sort || (isPeriod ? "key_asc" : "revenue_desc");
  const sorters = {
    revenue_desc: (a, b) => b.net_revenue - a.net_revenue,
    revenue_asc: (a, b) => a.net_revenue - b.net_revenue,
    units_desc: (a, b) => b.units_completed - a.units_completed,
    orders_desc: (a, b) => b.completed_orders - a.completed_orders,
    key_asc: (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  };
  groups.sort(sorters[sort]);

  const shown = args.limit ? groups.slice(0, args.limit) : groups;

  const lines = [`BREAKDOWN by ${dim} (filters: ${describeFilters(args)}; sorted ${sort}; ${groups.length} groups)`];
  shown.forEach((g, i) => {
    const head = isPeriod ? `${g.key}:` : `${i + 1}. ${g.key}:`;
    const parts = [
      `revenue=${fmt(g.net_revenue)}`,
      `orders=${g.completed_orders}`,
      `units=${g.units_completed}`,
      `aov=${fmt(g.aov)}`,
      `share=${fmt(g.share)}%`,
    ];
    if (dim === "month") parts.push(`mom=${g.change === null ? "n/a" : fmt(g.change) + "%"}`);
    if (dim === "quarter") parts.push(`change=${g.change === null ? "n/a" : fmt(g.change) + "%"}`);
    parts.push(`total_orders=${g.total_orders}`, `gross=${fmt(g.gross_revenue)}`);
    lines.push(`${head} ${parts.join(", ")}`);
  });

  const byRev = [...groups].sort((a, b) => b.net_revenue - a.net_revenue);
  const byUnits = [...groups].sort((a, b) => b.units_completed - a.units_completed);
  const top = byRev[0];
  const bottom = byRev[byRev.length - 1];

  lines.push(`TOTAL_NET_REVENUE: ${fmt(totalNet)}`);
  lines.push(`TOTAL_COMPLETED_ORDERS: ${groups.reduce((a, g) => a + g.completed_orders, 0)}`);
  lines.push(`HIGHEST_REVENUE: ${top.key} (${fmt(top.net_revenue)})`);
  lines.push(`LOWEST_REVENUE: ${bottom.key} (${fmt(bottom.net_revenue)})`);
  lines.push(`HIGHEST_UNITS: ${byUnits[0].key} (${byUnits[0].units_completed} units)`);
  if (isPeriod) {
    lines.push(`BEST_PERIOD: ${top.key} (${fmt(top.net_revenue)})`);
    lines.push(`WORST_PERIOD: ${bottom.key} (${fmt(bottom.net_revenue)})`);
  }
  if (args.limit && args.limit < groups.length) {
    const cum = shown.reduce((a, g) => a + g.net_revenue, 0);
    lines.push(`TOP_${shown.length}_SHARE: ${fmt(totalNet ? (cum / totalNet) * 100 : 0)}%`);
    lines.push(`TOP_${shown.length}_REVENUE: ${fmt(cum)}`);
  }
  return text(lines.join("\n"));
}
