import { readFileSync } from "node:fs";
import { z } from "zod";

export const name = "sales_breakdown";
export const description =
  "THE aggregation workhorse. Groups ALL 400 orders (never truncated) by any dimension and returns every metric already computed and rounded: " +
  "revenue, orders, units, aov, avg_units_per_order, share_of_total_pct, and - on request - refund metrics and month-over-month change. " +
  "group_by: region | category | product | customer_id | month | status. Optional then_by makes a two-level matrix (e.g. region x category cells 'AMER/hardware'). " +
  "status selects which orders count as revenue ('completed' = NET revenue, the default; 'all' = GROSS revenue). " +
  "The 'extras' block answers the follow-up questions for you: gap_first_to_second, top_n_revenue_sum, top_n_share_pct, best/worst group, " +
  "total_refunded_revenue, highest_refund_rate group, top_cell and per_group_top (matrix mode). " +
  "Do NOT do arithmetic, division, percentages or ranking by hand - ask this tool with the right arguments instead.";

const DIM = ["region", "category", "product", "customer_id", "month", "status"];

export const schema = {
  group_by: z.enum(DIM).describe("Primary grouping dimension. 'month' buckets the order date as YYYY-MM."),
  then_by: z.enum(DIM).optional().describe("Optional second dimension; produces one row per '<group_by>/<then_by>' cell."),
  status: z
    .enum(["completed", "refunded", "cancelled", "all"])
    .default("completed")
    .describe("Which orders count toward revenue/orders/units. 'completed' = NET revenue. 'all' = GROSS revenue."),
  sort: z
    .enum([
      "revenue_desc",
      "revenue_asc",
      "units_desc",
      "orders_desc",
      "avg_units_desc",
      "refunded_revenue_desc",
      "refund_rate_desc",
      "key_asc",
    ])
    .default("revenue_desc")
    .describe("Row ordering. Use key_asc for alphabetical/chronological output."),
  top_n: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Return only the first N rows after sorting. Shares and extras are still computed over ALL groups."),
  include_refund_metrics: z
    .boolean()
    .default(false)
    .describe("Add refunded_revenue, refunded_orders, total_orders_all_statuses, refund_rate_by_orders_pct and refunded_share_of_gross_pct per row (always computed over ALL statuses, independent of the status filter)."),
  include_mom: z
    .boolean()
    .default(false)
    .describe("Add mom_pct (month-over-month % change in revenue). Use with group_by='month' and sort='key_asc'."),
};

const rev = (o) => o.quantity * o.unit_price;
const r2 = (x) => Math.round(x * 100) / 100;
const m2 = (x) => (Number.isFinite(x) ? r2(x).toFixed(2) : "n/a");
const keyOf = (o, dim) => (dim === "month" ? o.date.slice(0, 7) : String(o[dim]));

export async function handler(args) {
  const orders = JSON.parse(readFileSync(new URL("../data/orders.json", import.meta.url), "utf8"));
  const { group_by, then_by, status = "completed", sort = "revenue_desc", top_n } = args;
  const includeRefund = Boolean(args.include_refund_metrics);
  const includeMom = Boolean(args.include_mom);

  if (then_by && then_by === group_by) {
    return { content: [{ type: "text", text: `then_by must differ from group_by (both '${group_by}').` }], isError: true };
  }

  const cellKey = (o) => (then_by ? `${keyOf(o, group_by)}/${keyOf(o, then_by)}` : keyOf(o, group_by));
  const matches = (o) => status === "all" || o.status === status;

  // Every distinct key that exists anywhere in the data, so zero-revenue cells are not silently dropped.
  const all = new Map();
  for (const o of orders) {
    const k = cellKey(o);
    let g = all.get(k);
    if (!g) all.set(k, (g = { key: k, revenue: 0, orders: 0, units: 0, allOrders: 0, gross: 0, refOrders: 0, refRevenue: 0 }));
    g.allOrders += 1;
    g.gross += rev(o);
    if (o.status === "refunded") { g.refOrders += 1; g.refRevenue += rev(o); }
    if (matches(o)) { g.revenue += rev(o); g.orders += 1; g.units += o.quantity; }
  }

  let groups = [...all.values()];
  const totalRevenue = groups.reduce((s, g) => s + g.revenue, 0);
  const totalRefunded = groups.reduce((s, g) => s + g.refRevenue, 0);

  const cmp = {
    revenue_desc: (a, b) => b.revenue - a.revenue || a.key.localeCompare(b.key),
    revenue_asc: (a, b) => a.revenue - b.revenue || a.key.localeCompare(b.key),
    units_desc: (a, b) => b.units - a.units || a.key.localeCompare(b.key),
    orders_desc: (a, b) => b.orders - a.orders || a.key.localeCompare(b.key),
    avg_units_desc: (a, b) => (b.orders ? b.units / b.orders : 0) - (a.orders ? a.units / a.orders : 0) || a.key.localeCompare(b.key),
    refunded_revenue_desc: (a, b) => b.refRevenue - a.refRevenue || a.key.localeCompare(b.key),
    refund_rate_desc: (a, b) => (b.refOrders / b.allOrders) - (a.refOrders / a.allOrders) || a.key.localeCompare(b.key),
    key_asc: (a, b) => a.key.localeCompare(b.key),
  }[sort];
  groups.sort(cmp);

  const shape = (g) => {
    const row = {
      key: g.key,
      revenue: m2(g.revenue),
      orders: g.orders,
      units: g.units,
      aov: g.orders ? m2(g.revenue / g.orders) : "n/a",
      avg_units_per_order: g.orders ? m2(g.units / g.orders) : "n/a",
      share_of_total_pct: totalRevenue ? m2((g.revenue / totalRevenue) * 100) : "n/a",
    };
    if (includeRefund) {
      row.total_orders_all_statuses = g.allOrders;
      row.gross_revenue_all_statuses = m2(g.gross);
      row.refunded_orders = g.refOrders;
      row.refunded_revenue = m2(g.refRevenue);
      row.refund_rate_by_orders_pct = m2((g.refOrders / g.allOrders) * 100);
      row.refunded_share_of_gross_pct = g.gross ? m2((g.refRevenue / g.gross) * 100) : "n/a";
    }
    return row;
  };

  const ordered = groups.slice();
  const shown = top_n ? ordered.slice(0, top_n) : ordered;
  const rows = shown.map(shape);

  if (includeMom) {
    const chrono = groups.slice().sort((a, b) => a.key.localeCompare(b.key));
    const momByKey = new Map();
    chrono.forEach((g, i) => {
      momByKey.set(g.key, i === 0 || !chrono[i - 1].revenue ? "n/a" : m2(((g.revenue - chrono[i - 1].revenue) / chrono[i - 1].revenue) * 100));
    });
    for (const row of rows) row.mom_pct = momByKey.get(row.key);
  }

  const byRevenue = groups.slice().sort((a, b) => b.revenue - a.revenue);
  const extras = {
    distinct_groups: groups.length,
    total_revenue_for_status_filter: m2(totalRevenue),
    best_group_by_revenue: byRevenue.length ? { key: byRevenue[0].key, revenue: m2(byRevenue[0].revenue) } : null,
    worst_group_by_revenue: byRevenue.length
      ? { key: byRevenue[byRevenue.length - 1].key, revenue: m2(byRevenue[byRevenue.length - 1].revenue) }
      : null,
  };

  if (ordered.length >= 2) {
    extras.gap_first_to_second = m2(ordered[0].revenue - ordered[1].revenue);
    extras.gap_note = `revenue of '${ordered[0].key}' minus revenue of '${ordered[1].key}' in the current sort order`;
  }

  if (top_n && ordered.length) {
    const sumTop = shown.reduce((s, g) => s + g.revenue, 0);
    extras.top_n = top_n;
    extras.top_n_revenue_sum = m2(sumTop);
    extras.top_n_share_pct = totalRevenue ? m2((sumTop / totalRevenue) * 100) : "n/a";
  }

  {
    const topUnits = groups.slice().sort((a, b) => b.units - a.units)[0];
    const topAvg = groups.slice().filter((g) => g.orders).sort((a, b) => b.units / b.orders - a.units / a.orders)[0];
    if (topUnits) extras.most_units_group = { key: topUnits.key, units: topUnits.units };
    if (topAvg) extras.highest_avg_units_per_order = { key: topAvg.key, avg_units_per_order: m2(topAvg.units / topAvg.orders) };
  }

  if (includeRefund) {
    const topRef = groups.slice().sort((a, b) => b.refRevenue - a.refRevenue)[0];
    const topRate = groups.slice().sort((a, b) => b.refOrders / b.allOrders - a.refOrders / a.allOrders)[0];
    extras.total_refunded_revenue_all_groups = m2(totalRefunded);
    if (topRef) extras.highest_refunded_revenue_group = { key: topRef.key, refunded_revenue: m2(topRef.refRevenue) };
    if (topRate)
      extras.highest_refund_rate_by_orders_group = {
        key: topRate.key,
        refund_rate_by_orders_pct: m2((topRate.refOrders / topRate.allOrders) * 100),
      };
  }

  if (includeMom) {
    const chrono = groups.slice().sort((a, b) => a.key.localeCompare(b.key));
    extras.first_period = chrono[0]?.key ?? null;
    extras.last_period = chrono[chrono.length - 1]?.key ?? null;
  }

  if (then_by) {
    const top = groups.slice().sort((a, b) => b.revenue - a.revenue)[0];
    if (top) extras.top_cell = { key: top.key, revenue: m2(top.revenue) };
    const per = new Map();
    for (const g of groups) {
      const parent = g.key.slice(0, g.key.indexOf("/"));
      const cur = per.get(parent);
      if (!cur || g.revenue > cur.revenue) per.set(parent, { key: g.key, child: g.key.slice(g.key.indexOf("/") + 1), revenue: g.revenue });
    }
    extras.per_group_top = [...per.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([parent, v]) => ({ [group_by]: parent, [`top_${then_by}`]: v.child, revenue: m2(v.revenue) }));
  }

  const out = {
    query: { group_by, then_by: then_by ?? null, status, sort, top_n: top_n ?? null, include_refund_metrics: includeRefund, include_mom: includeMom },
    scope: `ALL ${orders.length} rows scanned - no truncation, no sampling`,
    revenue_definition:
      status === "all" ? "revenue = quantity*unit_price over ALL statuses (GROSS)" : `revenue = quantity*unit_price over status='${status}' only`,
    rows_returned: rows.length,
    groups_total: groups.length,
    rows,
    extras,
    note: "Money and pct fields are strings already rounded to 2 decimals - copy them verbatim. Never recompute.",
  };

  return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
}
