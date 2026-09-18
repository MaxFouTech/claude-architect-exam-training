// General grouped aggregation: the main workhorse for the sales review.
import { readFileSync } from "node:fs";
import { z } from "zod";

export const name = "breakdown_orders";
export const description =
  "Group the whole sales dataset by any dimension and get finished metrics - the main tool for this review. " +
  "Per group it returns revenue (sum of quantity*unit_price), orders (count), units (sum of quantity), " +
  "aov (revenue/orders) and share (% of the scope's total revenue), already rounded to 2 decimals and ranked. " +
  "IMPORTANT: by default it counts ONLY status=='completed' orders, i.e. NET revenue. Pass status='all' for GROSS revenue " +
  "or status='refunded' to analyse refunds' value. " +
  "group_by accepts region, category, product, customer_id, month (YYYY-MM), quarter (Q1/Q2), status. " +
  "ONE CALL IS USUALLY ENOUGH - do not loop over regions/months with repeated filtered calls. " +
  "To get the leading sub-group of EVERY group at once (e.g. the top product in each region) use " +
  "then_by + top_per_group=1: breakdown_orders(group_by='region', then_by='product', top_per_group=1) returns all four " +
  "regions and their #1 product in a single response. Set include_change=true with group_by='month' or 'quarter' " +
  "(together with sort_by='key') to also get the period-over-period % change, and include_top_share=true with top=N " +
  "to get the combined share of the top N groups. The final TOTAL line gives the scope total. " +
  "Never sum rows by hand - call this instead.";
export const schema = {
  group_by: z
    .enum(["region", "category", "product", "customer_id", "month", "quarter", "status"])
    .describe("Primary grouping dimension"),
  then_by: z
    .enum(["region", "category", "product", "customer_id", "month", "quarter", "status"])
    .optional()
    .describe("Optional second dimension for a nested breakdown inside each primary group"),
  status: z
    .enum(["completed", "refunded", "cancelled", "all"])
    .optional()
    .describe("Which orders to include. Default 'completed' (NET revenue). 'all' gives GROSS revenue."),
  sort_by: z
    .enum(["revenue", "orders", "units", "aov", "key"])
    .optional()
    .describe("Ranking metric, default 'revenue'. Use 'key' for chronological/alphabetical order (best for month/quarter)."),
  order: z.enum(["desc", "asc"]).optional().describe("Sort direction, default 'desc' ('asc' when sort_by='key')"),
  top: z.number().int().min(1).max(100).optional().describe("Keep only the first N primary groups after sorting. Default: all."),
  top_per_group: z.number().int().min(1).max(100).optional().describe("With then_by: keep only the first N sub-groups per primary group"),
  include_change: z.boolean().optional().describe("Add period-over-period % change; only meaningful with group_by month/quarter sorted by key"),
  include_top_share: z.boolean().optional().describe("Add a TOP_N_SHARE line: combined % of scope revenue held by the returned top groups"),
  region: z.string().optional().describe("Optional region filter applied before grouping"),
  category: z.string().optional().describe("Optional category filter applied before grouping"),
  product: z.string().optional().describe("Optional product filter applied before grouping"),
  customer_id: z.string().optional().describe("Optional customer filter applied before grouping"),
  month: z.string().optional().describe("Optional single-month filter 'YYYY-MM'"),
};

const r2 = (n) => Math.round(n * 100) / 100;
const keyOf = (o, dim) =>
  dim === "month" ? o.date.slice(0, 7)
    : dim === "quarter" ? (Number(o.date.slice(5, 7)) <= 3 ? "Q1" : "Q2")
      : o[dim];

function aggregate(rows, dim) {
  const g = new Map();
  for (const o of rows) {
    const k = keyOf(o, dim);
    if (!g.has(k)) g.set(k, { key: k, revenue: 0, orders: 0, units: 0 });
    const e = g.get(k);
    e.revenue += o.quantity * o.unit_price;
    e.orders++;
    e.units += o.quantity;
  }
  return [...g.values()].map((e) => ({ ...e, aov: e.orders ? e.revenue / e.orders : 0 }));
}

function sortList(list, sortBy, order) {
  const dir = order === "asc" ? 1 : -1;
  if (sortBy === "key") {
    const d = order === "desc" ? -1 : 1;
    return list.sort((a, b) => d * String(a.key).localeCompare(String(b.key)));
  }
  return list.sort((a, b) => dir * (a[sortBy] - b[sortBy]) || String(a.key).localeCompare(String(b.key)));
}

export async function handler(args) {
  const orders = JSON.parse(readFileSync(new URL("../data/orders.json", import.meta.url), "utf8"));
  const status = args.status || "completed";
  const sortBy = args.sort_by || "revenue";
  const order = args.order || (sortBy === "key" ? "asc" : "desc");

  const rows = orders.filter(
    (o) =>
      (status === "all" || o.status === status) &&
      (!args.region || o.region === args.region) &&
      (!args.category || o.category === args.category) &&
      (!args.product || o.product === args.product) &&
      (!args.customer_id || o.customer_id === args.customer_id) &&
      (!args.month || o.date.slice(0, 7) === args.month)
  );
  if (rows.length === 0) {
    return { content: [{ type: "text", text: "No orders match those filters/status." }], isError: true };
  }

  const scopeRevenue = rows.reduce((a, o) => a + o.quantity * o.unit_price, 0);
  const label = status === "all" ? "GROSS revenue, all statuses" : `${status} orders only`;
  const lines = [`BREAKDOWN BY ${args.group_by.toUpperCase()} (${label}; ranked by ${sortBy} ${order})`];

  let list = sortList(aggregate(rows, args.group_by), sortBy, order);
  const fullCount = list.length;
  if (args.top) list = list.slice(0, args.top);

  const fmt = (e, prefix) =>
    `${prefix}${e.key}: revenue=${r2(e.revenue)}, orders=${e.orders}, units=${e.units}, ` +
    `aov=${r2(e.aov)}, share=${r2((e.revenue / scopeRevenue) * 100)}%`;

  list.forEach((e, i) => {
    let line = fmt(e, `${i + 1}. `);
    if (args.include_change) {
      const prev = list[i - 1];
      line += `, change=${prev ? r2(((e.revenue - prev.revenue) / prev.revenue) * 100) + "%" : "n/a"}`;
    }
    lines.push(line);
    if (args.then_by) {
      const sub = sortList(
        aggregate(rows.filter((o) => keyOf(o, args.group_by) === e.key), args.then_by),
        sortBy === "key" ? "revenue" : sortBy,
        sortBy === "key" ? "desc" : order
      );
      const shown = args.top_per_group ? sub.slice(0, args.top_per_group) : sub;
      for (const s of shown) {
        lines.push(
          `      - ${s.key}: revenue=${r2(s.revenue)}, orders=${s.orders}, units=${s.units}, aov=${r2(s.aov)}`
        );
      }
    }
  });

  lines.push("");
  lines.push(`TOTAL: revenue=${r2(scopeRevenue)}, orders=${rows.length}, units=${rows.reduce((a, o) => a + o.quantity, 0)}, groups=${fullCount}`);
  if (args.include_top_share) {
    const shown = list.reduce((a, e) => a + e.revenue, 0);
    lines.push(`TOP_${list.length}_SHARE: ${r2((shown / scopeRevenue) * 100)}%   (of the ${r2(scopeRevenue)} scope total)`);
  }
  if (sortBy !== "key") {
    const best = list[0], worst = sortList(aggregate(rows, args.group_by), sortBy, order === "desc" ? "asc" : "desc")[0];
    lines.push(`HIGHEST_${sortBy.toUpperCase()}: ${best.key} (${r2(best[sortBy])})`);
    lines.push(`LOWEST_${sortBy.toUpperCase()}: ${worst.key} (${r2(worst[sortBy])})`);
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
