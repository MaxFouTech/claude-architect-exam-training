// General aggregation tool for the Jan-Jun 2026 orders dataset.
// One call returns every metric for one grouping dimension, already ranked,
// plus overall totals and highlights. Workers must never add rows by hand.
import { readFileSync } from "node:fs";
import { z } from "zod";

export const name = "sales_summary";
export const description =
  "Aggregate the sales orders (400 rows, Jan-Jun 2026) and return ready-to-report numbers. " +
  "Pick ONE grouping dimension with group_by: 'total' (whole file, one TOTALS block), 'region' (AMER/APAC/EMEA/LATAM), " +
  "'category' (hardware/services/subscription/accessories), 'product', 'customer', 'month' (YYYY-MM), 'quarter', 'status'. " +
  "Every group line already contains: net_revenue (completed orders only), completed_orders, units_completed, aov (=net_revenue/completed_orders), " +
  "net_share_pct (share of total net revenue), all_orders (every status), refunded_orders, cancelled_orders, " +
  "refund_rate_pct (=refunded_orders/all_orders*100), refunded_revenue, gross_revenue (all statuses). " +
  "For group_by='month' or 'quarter' each line also has change_pct = month-over-month / period-over-period change of net_revenue ('n/a' for the first period). " +
  "Rows are ranked and numbered; choose the ranking with sort_by ('net_revenue' default, or 'refund_rate', 'units', 'orders', 'aov', 'gross_revenue', 'refunded_revenue', 'key'). " +
  "Use top=N to show only the first N rows: the footer then prints SHOWN_ROWS_NET_SHARE_PCT, the combined share of those N rows against the full total. " +
  "The footer TOTALS block (TOTAL_ORDERS, COMPLETED, REFUNDED, CANCELLED, GROSS_REVENUE, NET_REVENUE, AOV, UNITS_COMPLETED, OVERALL_REFUND_RATE_PCT) " +
  "and the HIGHLIGHTS block (highest/lowest net revenue group, most units group, worst refund-rate group, computed over ALL groups even when top is used) are always included. " +
  "Optional filters region/category/product/customer/status/date_from/date_to narrow the data before aggregating (e.g. date_from='2026-01-01', date_to='2026-03-31' for Q1). " +
  "All numbers are already rounded to 2 decimals - copy them verbatim, do not re-round or pad.";

export const schema = {
  group_by: z
    .enum(["total", "region", "category", "product", "customer", "month", "quarter", "status", "date"])
    .optional()
    .describe("Grouping dimension. Default 'total' (no grouping, footer only)."),
  sort_by: z
    .enum(["net_revenue", "gross_revenue", "orders", "all_orders", "units", "aov", "refund_rate", "refunded_orders", "refunded_revenue", "key"])
    .optional()
    .describe("Ranking key. Default 'net_revenue' ('key' = chronological/alphabetical). month/quarter always print chronologically unless sort_by is set."),
  order: z.enum(["desc", "asc"]).optional().describe("Sort direction. Default 'desc' for metrics, 'asc' for 'key'."),
  top: z.number().int().min(1).optional().describe("Show only the first N ranked rows. Footer then adds SHOWN_ROWS_NET_SHARE_PCT."),
  region: z.string().optional().describe("Filter: only this region."),
  category: z.string().optional().describe("Filter: only this category."),
  product: z.string().optional().describe("Filter: only this product."),
  customer: z.string().optional().describe("Filter: only this customer_id, e.g. C012."),
  status: z.string().optional().describe("Filter: only this status (completed/refunded/cancelled). Leave empty: net metrics already use completed only."),
  date_from: z.string().optional().describe("Filter: inclusive start date YYYY-MM-DD (or YYYY-MM)."),
  date_to: z.string().optional().describe("Filter: inclusive end date YYYY-MM-DD (or YYYY-MM, whole month included)."),
};

const load = () => JSON.parse(readFileSync(new URL("../data/orders.json", import.meta.url), "utf8"));
const rev = (o) => o.quantity * o.unit_price;

// round to 2 decimals and drop trailing zeros: 1296.2 / 1345 / 30.32
function n(x) {
  if (!isFinite(x)) return "n/a";
  return String(Math.round(x * 100) / 100);
}

function keyOf(o, dim) {
  switch (dim) {
    case "total": return "ALL";
    case "region": return o.region;
    case "category": return o.category;
    case "product": return o.product;
    case "customer": return o.customer_id;
    case "status": return o.status;
    case "date": return o.date;
    case "month": return o.date.slice(0, 7);
    case "quarter": {
      const m = Number(o.date.slice(5, 7));
      return `${o.date.slice(0, 4)}-Q${Math.floor((m - 1) / 3) + 1}`;
    }
    default: return "ALL";
  }
}

export function applyFilters(orders, a) {
  const from = a.date_from ? (a.date_from.length === 7 ? a.date_from + "-01" : a.date_from) : null;
  const to = a.date_to ? (a.date_to.length === 7 ? a.date_to + "-31" : a.date_to) : null;
  return orders.filter(
    (o) =>
      (!a.region || o.region === a.region) &&
      (!a.category || o.category === a.category) &&
      (!a.product || o.product === a.product) &&
      (!a.customer || o.customer_id === a.customer) &&
      (!a.status || o.status === a.status) &&
      (!from || o.date >= from) &&
      (!to || o.date <= to)
  );
}

export function aggregate(rows, dim) {
  const m = new Map();
  for (const o of rows) {
    const k = keyOf(o, dim);
    let g = m.get(k);
    if (!g) {
      g = { key: k, all_orders: 0, completed: 0, refunded: 0, cancelled: 0, net: 0, gross: 0, refunded_revenue: 0, units: 0 };
      m.set(k, g);
    }
    const r = rev(o);
    g.all_orders++;
    g.gross += r;
    if (o.status === "completed") { g.completed++; g.net += r; g.units += o.quantity; }
    else if (o.status === "refunded") { g.refunded++; g.refunded_revenue += r; }
    else if (o.status === "cancelled") { g.cancelled++; }
  }
  return [...m.values()];
}

const METRIC = {
  net_revenue: (g) => g.net,
  gross_revenue: (g) => g.gross,
  orders: (g) => g.completed,
  all_orders: (g) => g.all_orders,
  units: (g) => g.units,
  aov: (g) => (g.completed ? g.net / g.completed : 0),
  refund_rate: (g) => (g.all_orders ? (g.refunded / g.all_orders) * 100 : 0),
  refunded_orders: (g) => g.refunded,
  refunded_revenue: (g) => g.refunded_revenue,
};

export async function handler(args = {}) {
  const dim = args.group_by || "total";
  const rows = applyFilters(load(), args);
  if (rows.length === 0) {
    return { content: [{ type: "text", text: "No orders match those filters." }], isError: true };
  }
  const groups = aggregate(rows, dim);

  const totalNet = groups.reduce((a, g) => a + g.net, 0);
  const chronological = dim === "month" || dim === "quarter" || dim === "date";

  const sortBy = args.sort_by || (chronological ? "key" : "net_revenue");
  const dir = args.order || (sortBy === "key" ? "asc" : "desc");
  const sorted = [...groups].sort((a, b) => {
    let c;
    if (sortBy === "key") c = String(a.key).localeCompare(String(b.key));
    else c = METRIC[sortBy](a) - METRIC[sortBy](b);
    if (c === 0) c = String(a.key).localeCompare(String(b.key));
    return dir === "asc" ? c : -c;
  });

  // change_pct always follows chronological order, independent of the display sort
  const changes = new Map();
  if (dim === "month" || dim === "quarter" || dim === "date") {
    const chrono = [...groups].sort((a, b) => String(a.key).localeCompare(String(b.key)));
    chrono.forEach((g, i) => {
      if (i === 0) changes.set(g.key, "n/a");
      else {
        const prev = chrono[i - 1].net;
        changes.set(g.key, prev ? n(((g.net - prev) / prev) * 100) : "n/a");
      }
    });
  }

  const shown = args.top ? sorted.slice(0, args.top) : sorted;
  const out = [];
  out.push(`GROUP_BY: ${dim}  (rows aggregated: ${rows.length}, groups: ${groups.length}, ranked by ${sortBy} ${dir})`);

  if (dim !== "total") {
    for (let i = 0; i < shown.length; i++) {
      const g = shown[i];
      const share = totalNet ? (g.net / totalNet) * 100 : 0;
      const parts = [
        `net_revenue=${n(g.net)}`,
        `completed_orders=${g.completed}`,
        `aov=${n(g.completed ? g.net / g.completed : 0)}`,
        `net_share_pct=${n(share)}`,
        `units_completed=${g.units}`,
        `all_orders=${g.all_orders}`,
        `refunded_orders=${g.refunded}`,
        `cancelled_orders=${g.cancelled}`,
        `refund_rate_pct=${n(g.all_orders ? (g.refunded / g.all_orders) * 100 : 0)}`,
        `refunded_revenue=${n(g.refunded_revenue)}`,
        `gross_revenue=${n(g.gross)}`,
      ];
      if (changes.size) parts.splice(4, 0, `change_pct=${changes.get(g.key)}`);
      out.push(`${i + 1}. ${g.key} | ${parts.join(" ")}`);
    }
    if (args.top && args.top < groups.length) {
      const shownNet = shown.reduce((a, g) => a + g.net, 0);
      out.push(`SHOWN_ROWS_NET_SHARE_PCT: ${n(totalNet ? (shownNet / totalNet) * 100 : 0)}  (combined net revenue share of the ${shown.length} rows above vs all ${groups.length} groups)`);
    }
  }

  const T = aggregate(rows, "total")[0];
  out.push("TOTALS (all rows after filters):");
  out.push(`TOTAL_ORDERS: ${T.all_orders}`);
  out.push(`COMPLETED: ${T.completed}`);
  out.push(`REFUNDED: ${T.refunded}`);
  out.push(`CANCELLED: ${T.cancelled}`);
  out.push(`GROSS_REVENUE: ${n(T.gross)}`);
  out.push(`NET_REVENUE: ${n(T.net)}`);
  out.push(`AOV: ${n(T.completed ? T.net / T.completed : 0)}`);
  out.push(`UNITS_COMPLETED: ${T.units}`);
  out.push(`OVERALL_REFUND_RATE_PCT: ${n(T.all_orders ? (T.refunded / T.all_orders) * 100 : 0)}`);
  out.push(`TOTAL_REFUNDED_REVENUE: ${n(T.refunded_revenue)}`);

  if (dim !== "total" && groups.length > 1) {
    const best = (f) => [...groups].sort((a, b) => f(b) - f(a) || String(a.key).localeCompare(String(b.key)))[0];
    const worst = (f) => [...groups].sort((a, b) => f(a) - f(b) || String(a.key).localeCompare(String(b.key)))[0];
    const hiRev = best(METRIC.net_revenue), loRev = worst(METRIC.net_revenue);
    const hiUnits = best(METRIC.units), hiRate = best(METRIC.refund_rate);
    out.push(`HIGHLIGHTS (over all ${groups.length} ${dim} groups):`);
    out.push(`HIGHEST_NET_REVENUE: ${hiRev.key} (${n(hiRev.net)})`);
    out.push(`LOWEST_NET_REVENUE: ${loRev.key} (${n(loRev.net)})`);
    out.push(`MOST_UNITS: ${hiUnits.key} (${hiUnits.units} units)`);
    out.push(`HIGHEST_REFUND_RATE: ${hiRate.key} (${n(METRIC.refund_rate(hiRate))}%)`);
  }

  return { content: [{ type: "text", text: out.join("\n") }] };
}
