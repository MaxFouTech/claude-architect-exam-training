// General group-by aggregation over the sales file. One tool for every breakdown in the review.
import { readFileSync } from "node:fs";
import { z } from "zod";

export const name = "sales_breakdown";
export const description = [
  "THE aggregation workhorse for data/orders.json (Jan-Jun 2026). Groups all 400 orders by one dimension",
  "(group_by: region | category | product | customer | month | quarter | status) and returns a ranked table with,",
  "per group: net_revenue (completed orders only), completed_orders, aov, share_net (% of total net revenue),",
  "units (completed quantity), total_orders (all statuses), refunded, refund_rate%, refunded_revenue, gross_revenue.",
  "For group_by=month or quarter each row also carries change=% versus the previous period (n/a for the first).",
  "sort_by picks the ranking metric (default net_revenue) and order asc|desc; limit shows only the top N rows but",
  "shares, totals and the HIGHEST/LOWEST footer lines are still computed over ALL groups, and SELECTED_SHARE_NET",
  "gives the combined share of the shown rows (use it for 'top 5 customers share'). Optional then_by adds, under",
  "each group, its sub-breakdown ranked by net revenue (e.g. group_by=region, then_by=category or then_by=product)",
  "so you can read the top category/product per region straight off. Filters narrow the slice first.",
  "Every number is final and already rounded to 2 decimals: copy exactly, never re-round, never sum rows by hand.",
].join(" ");

export const schema = {
  group_by: z.string().describe("region | category | product | customer | month | quarter | status"),
  then_by: z.string().optional().describe("Optional 2nd dimension for a sub-breakdown per group (same values as group_by)"),
  then_limit: z.number().int().min(1).max(20).optional().describe("Sub-rows per group, default 3"),
  sort_by: z
    .string()
    .optional()
    .describe("net_revenue | gross_revenue | refund_rate | refunded_revenue | total_orders | completed_orders | units | aov | key. Default net_revenue (key for month/quarter)"),
  order: z.string().optional().describe("desc (default) or asc. Use asc to find the lowest group"),
  limit: z.number().int().min(1).max(100).optional().describe("Show only the top N groups; default all"),
  region: z.string().optional().describe("Filter: region"),
  category: z.string().optional().describe("Filter: category"),
  product: z.string().optional().describe("Filter: exact product name"),
  customer_id: z.string().optional().describe("Filter: customer id, e.g. C007"),
  month_from: z.string().optional().describe("Inclusive start month YYYY-MM"),
  month_to: z.string().optional().describe("Inclusive end month YYYY-MM"),
};

const num = (x) => {
  const v = Math.round((x + Number.EPSILON) * 100) / 100;
  return Number.isFinite(v) ? String(v) : "n/a";
};
const rev = (o) => o.quantity * o.unit_price;

const DIMS = {
  region: (o) => o.region,
  category: (o) => o.category,
  product: (o) => o.product,
  customer: (o) => o.customer_id,
  customer_id: (o) => o.customer_id,
  month: (o) => o.date.slice(0, 7),
  quarter: (o) => `${o.date.slice(0, 4)}-Q${Math.floor(Number(o.date.slice(5, 7)) - 1) / 3 + 1}`,
  status: (o) => o.status,
};

function quarterKey(o) {
  const m = Number(o.date.slice(5, 7));
  return `${o.date.slice(0, 4)}-Q${Math.ceil(m / 3)}`;
}
DIMS.quarter = quarterKey;

function agg(rows) {
  const comp = rows.filter((o) => o.status === "completed");
  const ref = rows.filter((o) => o.status === "refunded");
  const net = comp.reduce((a, o) => a + rev(o), 0);
  return {
    net_revenue: net,
    gross_revenue: rows.reduce((a, o) => a + rev(o), 0),
    completed_orders: comp.length,
    total_orders: rows.length,
    refunded: ref.length,
    cancelled: rows.filter((o) => o.status === "cancelled").length,
    refund_rate: rows.length ? (ref.length / rows.length) * 100 : 0,
    refunded_revenue: ref.reduce((a, o) => a + rev(o), 0),
    units: comp.reduce((a, o) => a + o.quantity, 0),
    aov: comp.length ? net / comp.length : 0,
  };
}

export async function handler(args = {}) {
  const a = args || {};
  const orders = JSON.parse(readFileSync(new URL("../data/orders.json", import.meta.url), "utf8"));
  const key = DIMS[String(a.group_by || "").toLowerCase()];
  if (!key) {
    return {
      content: [{ type: "text", text: `ERROR: unknown group_by="${a.group_by}". Use one of: ${Object.keys(DIMS).join(", ")}` }],
      isError: true,
    };
  }
  const sub = a.then_by ? DIMS[String(a.then_by).toLowerCase()] : null;
  if (a.then_by && !sub) {
    return { content: [{ type: "text", text: `ERROR: unknown then_by="${a.then_by}". Use one of: ${Object.keys(DIMS).join(", ")}` }], isError: true };
  }

  const rows = orders.filter((o) => {
    const m = o.date.slice(0, 7);
    if (a.region && o.region !== a.region) return false;
    if (a.category && o.category !== a.category) return false;
    if (a.product && o.product !== a.product) return false;
    if (a.customer_id && o.customer_id !== a.customer_id) return false;
    if (a.month_from && m < a.month_from) return false;
    if (a.month_to && m > a.month_to) return false;
    return true;
  });

  const buckets = new Map();
  for (const o of rows) {
    const k = key(o);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(o);
  }

  const totalNet = rows.filter((o) => o.status === "completed").reduce((a2, o) => a2 + rev(o), 0);
  let groups = [...buckets.entries()].map(([k, rs]) => ({ key: k, rows: rs, ...agg(rs) }));
  for (const g of groups) g.share_net = totalNet ? (g.net_revenue / totalNet) * 100 : 0;

  // period-over-period change, always chronological regardless of sort
  const periodic = ["month", "quarter"].includes(String(a.group_by).toLowerCase());
  if (periodic) {
    const chrono = [...groups].sort((x, y) => (x.key < y.key ? -1 : 1));
    chrono.forEach((g, i) => {
      const prev = chrono[i - 1];
      g.change = i === 0 || !prev || prev.net_revenue === 0 ? null : ((g.net_revenue - prev.net_revenue) / prev.net_revenue) * 100;
    });
  }

  const sortBy = String(a.sort_by || (periodic ? "key" : "net_revenue")).toLowerCase();
  const valid = ["net_revenue", "gross_revenue", "refund_rate", "refunded_revenue", "total_orders", "completed_orders", "units", "aov", "key"];
  if (!valid.includes(sortBy)) {
    return { content: [{ type: "text", text: `ERROR: unknown sort_by="${a.sort_by}". Use one of: ${valid.join(", ")}` }], isError: true };
  }
  const desc = String(a.order || "desc").toLowerCase() !== "asc";
  const cmp = (x, y) => (sortBy === "key" ? (x.key < y.key ? -1 : x.key > y.key ? 1 : 0) : x[sortBy] - y[sortBy]);
  // sorting by key defaults to ascending (chronological for month/quarter, A-Z otherwise)
  const keyAsc = sortBy === "key" && !a.order;
  const effDesc = keyAsc ? false : desc;
  groups.sort((x, y) => (effDesc ? -cmp(x, y) : cmp(x, y)));

  const all = groups;
  const shown = a.limit ? groups.slice(0, a.limit) : groups;

  const out = [];
  const f = [
    a.region && `region=${a.region}`,
    a.category && `category=${a.category}`,
    a.product && `product=${a.product}`,
    a.customer_id && `customer_id=${a.customer_id}`,
    a.month_from && `month_from=${a.month_from}`,
    a.month_to && `month_to=${a.month_to}`,
  ].filter(Boolean);
  out.push(`GROUP_BY: ${a.group_by} | SORT: ${sortBy} ${effDesc ? "desc" : "asc"} | FILTERS: ${f.length ? f.join(", ") : "none"}`);
  out.push(`GROUPS_TOTAL: ${all.length}${a.limit ? ` (showing ${shown.length})` : ""}`);
  out.push("");

  shown.forEach((g, i) => {
    const parts = [
      `net_revenue=${num(g.net_revenue)}`,
      `completed_orders=${g.completed_orders}`,
      `aov=${num(g.aov)}`,
      `share_net=${num(g.share_net)}%`,
      `units=${g.units}`,
      `total_orders=${g.total_orders}`,
      `refunded=${g.refunded}`,
      `refund_rate=${num(g.refund_rate)}%`,
      `refunded_revenue=${num(g.refunded_revenue)}`,
      `gross_revenue=${num(g.gross_revenue)}`,
    ];
    if (periodic) parts.push(`change=${g.change === null || g.change === undefined ? "n/a" : num(g.change) + "%"}`);
    out.push(`${i + 1}. ${g.key}: ${parts.join(", ")}`);
    if (sub) {
      const sm = new Map();
      for (const o of g.rows) {
        const k = sub(o);
        if (!sm.has(k)) sm.set(k, []);
        sm.get(k).push(o);
      }
      const subs = [...sm.entries()]
        .map(([k, rs]) => ({ key: k, ...agg(rs) }))
        .sort((x, y) => y.net_revenue - x.net_revenue)
        .slice(0, a.then_limit || 3);
      subs.forEach((s, j) => {
        out.push(`     ${j + 1}) ${a.then_by}=${s.key}: net_revenue=${num(s.net_revenue)}, completed_orders=${s.completed_orders}, units=${s.units}, total_orders=${s.total_orders}, refunded=${s.refunded}, refund_rate=${num(s.refund_rate)}%`);
      });
      if (subs.length) out.push(`     TOP_${a.then_by.toUpperCase()}: ${subs[0].key} (${num(subs[0].net_revenue)})`);
    }
  });

  out.push("");
  const gTotal = agg(rows);
  out.push(`TOTAL_NET_REVENUE: ${num(gTotal.net_revenue)}`);
  out.push(`TOTAL_GROSS_REVENUE: ${num(gTotal.gross_revenue)}`);
  out.push(`TOTAL_ORDERS: ${gTotal.total_orders}`);
  out.push(`TOTAL_COMPLETED_ORDERS: ${gTotal.completed_orders}`);
  out.push(`TOTAL_REFUNDED_ORDERS: ${gTotal.refunded}`);
  out.push(`OVERALL_REFUND_RATE: ${num(gTotal.refund_rate)}%`);
  out.push(`TOTAL_REFUNDED_REVENUE: ${num(gTotal.refunded_revenue)}`);
  out.push(`TOTAL_UNITS_COMPLETED: ${gTotal.units}`);

  if (a.limit && shown.length < all.length) {
    const selNet = shown.reduce((s, g) => s + g.net_revenue, 0);
    out.push(`SELECTED_NET_REVENUE: ${num(selNet)}`);
    out.push(`SELECTED_SHARE_NET: ${num(totalNet ? (selNet / totalNet) * 100 : 0)}%`);
  }

  const byNet = [...all].sort((x, y) => y.net_revenue - x.net_revenue);
  const byUnits = [...all].sort((x, y) => y.units - x.units);
  const byRate = [...all].sort((x, y) => y.refund_rate - x.refund_rate);
  if (byNet.length) {
    out.push(`HIGHEST_NET_REVENUE: ${byNet[0].key} (${num(byNet[0].net_revenue)})`);
    out.push(`LOWEST_NET_REVENUE: ${byNet[byNet.length - 1].key} (${num(byNet[byNet.length - 1].net_revenue)})`);
    out.push(`MOST_UNITS: ${byUnits[0].key} (${byUnits[0].units} units)`);
    out.push(`HIGHEST_REFUND_RATE: ${byRate[0].key} (${num(byRate[0].refund_rate)}%)`);
  }
  if (periodic) {
    const chrono = [...all].sort((x, y) => (x.key < y.key ? -1 : 1));
    out.push(`CHRONOLOGICAL_ORDER: ${chrono.map((g) => g.key).join(", ")}`);
  }
  if (!rows.length) out.push("WARNING: no orders matched these filters; check spelling of filter values.");

  return { content: [{ type: "text", text: out.join("\n") }] };
}
