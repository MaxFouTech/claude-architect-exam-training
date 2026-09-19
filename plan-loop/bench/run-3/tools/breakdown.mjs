// General grouped aggregation. Scans ALL orders. Pre-computes ranks, shares, AOV, MoM.
import { readFileSync } from "node:fs";
import { z } from "zod";

export const name = "breakdown";
export const description =
  "Grouped revenue aggregation over ALL orders (no row cap, nothing truncated). THIS IS THE MAIN TOOL - use it for every ranking, breakdown or trend question. " +
  "group_by: 'region' | 'month' | 'quarter' | 'category' | 'product' | 'customer' | 'status' | 'region_category' | 'region_product'. " +
  "status defaults to 'completed' (= NET revenue). Use status='all' for gross/total-order questions. " +
  "For each group it prints a ready-made line: '<rank>. <GROUP>: revenue=<x>, orders=<int>, units=<int>, aov=<x>, share=<x>%' " +
  "(for group_by='month' or 'quarter' a 'mom=<x>%' month-over-month field is added and rows are in chronological order). " +
  "A FOOTER then gives TOTAL_REVENUE, TOTAL_ORDERS, TOP_GROUP_BY_REVENUE, LOWEST_GROUP_BY_REVENUE, MOST_UNITS_GROUP, and TOP<N>_SHARE when top_n is set. " +
  "Footer values are always computed over ALL groups even when top_n truncates the printed list. " +
  "revenue = quantity * unit_price. Every number is already rounded to 2 decimals - copy exactly as printed, never re-round, re-pad or recompute by hand.";

export const schema = {
  group_by: z
    .enum(["region", "month", "quarter", "category", "product", "customer", "status", "region_category", "region_product"])
    .describe("Dimension to group by"),
  status: z
    .enum(["completed", "refunded", "cancelled", "all"])
    .optional()
    .describe("Which orders to include. Default 'completed' (NET revenue). 'all' = every status (GROSS)."),
  top_n: z.number().int().min(1).optional().describe("Print only the top N groups; also prints their combined TOP<N>_SHARE"),
  top_per_group: z.number().int().min(1).optional().describe("For region_category / region_product: keep only the best N per region"),
  sort: z.enum(["revenue", "units", "orders", "aov", "name"]).optional().describe("Sort key, descending. Default 'revenue' (chronological for month/quarter)"),
  region: z.string().optional().describe("Optional filter: one region"),
  category: z.string().optional().describe("Optional filter: one category"),
  product: z.string().optional().describe("Optional filter: one product"),
  quarter: z.string().optional().describe("Optional filter: 'Q1' or 'Q2'"),
};

const n2 = (v) => String(Math.round((Number(v) + Number.EPSILON) * 100) / 100);
const Q1 = ["2026-01", "2026-02", "2026-03"];
const Q2 = ["2026-04", "2026-05", "2026-06"];

export async function handler(args = {}) {
  const orders = JSON.parse(readFileSync(new URL("../data/orders.json", import.meta.url), "utf8"));
  const rev = (o) => o.quantity * o.unit_price;
  const status = args.status || "completed";
  const qf = (args.quarter || "").toUpperCase();

  const rows = orders.filter((o) => {
    if (status !== "all" && o.status !== status) return false;
    if (args.region && o.region !== args.region) return false;
    if (args.category && o.category !== args.category) return false;
    if (args.product && o.product !== args.product) return false;
    if (qf === "Q1" && !Q1.includes(o.date.slice(0, 7))) return false;
    if (qf === "Q2" && !Q2.includes(o.date.slice(0, 7))) return false;
    return true;
  });

  const keyOf = (o) => {
    switch (args.group_by) {
      case "region": return o.region;
      case "month": return o.date.slice(0, 7);
      case "quarter": return Q1.includes(o.date.slice(0, 7)) ? "Q1" : "Q2";
      case "category": return o.category;
      case "product": return o.product;
      case "customer": return o.customer_id;
      case "status": return o.status;
      case "region_category": return `${o.region} > ${o.category}`;
      case "region_product": return `${o.region} > ${o.product}`;
      default: return "all";
    }
  };

  const map = new Map();
  for (const o of rows) {
    const k = keyOf(o);
    if (!map.has(k)) map.set(k, { key: k, revenue: 0, orders: 0, units: 0 });
    const g = map.get(k);
    g.revenue += rev(o);
    g.orders += 1;
    g.units += o.quantity;
  }
  let groups = [...map.values()];
  for (const g of groups) g.aov = g.orders ? g.revenue / g.orders : 0;

  const grandRevenue = groups.reduce((a, g) => a + g.revenue, 0);
  const grandOrders = groups.reduce((a, g) => a + g.orders, 0);
  for (const g of groups) g.share = grandRevenue ? (g.revenue / grandRevenue) * 100 : 0;

  const chronological = args.group_by === "month" || args.group_by === "quarter";
  const sort = args.sort || (chronological ? "name" : "revenue");
  const cmp = {
    revenue: (a, b) => b.revenue - a.revenue,
    units: (a, b) => b.units - a.units,
    orders: (a, b) => b.orders - a.orders,
    aov: (a, b) => b.aov - a.aov,
    name: (a, b) => String(a.key).localeCompare(String(b.key)),
  }[sort];

  // footer stats over ALL groups, before any truncation
  const byRev = [...groups].sort((a, b) => b.revenue - a.revenue);
  const byUnits = [...groups].sort((a, b) => b.units - a.units);
  const top = byRev[0];
  const low = byRev[byRev.length - 1];
  const most = byUnits[0];

  // month-over-month on the chronological sequence
  const momMap = new Map();
  if (chronological) {
    const chrono = [...groups].sort((a, b) => String(a.key).localeCompare(String(b.key)));
    chrono.forEach((g, i) => {
      if (i === 0) momMap.set(g.key, "n/a");
      else {
        const prev = chrono[i - 1].revenue;
        momMap.set(g.key, prev ? n2(((g.revenue - prev) / prev) * 100) : "n/a");
      }
    });
  }

  if (args.top_per_group && (args.group_by === "region_category" || args.group_by === "region_product")) {
    const perRegion = new Map();
    for (const g of [...groups].sort((a, b) => b.revenue - a.revenue)) {
      const r = String(g.key).split(" > ")[0];
      if (!perRegion.has(r)) perRegion.set(r, []);
      if (perRegion.get(r).length < args.top_per_group) perRegion.get(r).push(g);
    }
    groups = [...perRegion.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .flatMap(([, v]) => v);
  } else {
    groups.sort(cmp);
  }

  const printed = args.top_n ? groups.slice(0, args.top_n) : groups;

  const lines = printed.map((g, i) => {
    const base = `${i + 1}. ${g.key}: revenue=${n2(g.revenue)}, orders=${g.orders}, units=${g.units}, aov=${n2(g.aov)}, share=${n2(g.share)}%`;
    if (!chronological) return base;
    const m = momMap.get(g.key);
    return `${base}, mom=${m === "n/a" ? "n/a" : `${m}%`}`;
  });

  const footer = [
    `--- FOOTER (over all ${byRev.length} groups) ---`,
    `TOTAL_REVENUE: ${n2(grandRevenue)}`,
    `TOTAL_ORDERS: ${grandOrders}`,
    `TOP_GROUP_BY_REVENUE: ${top ? `${top.key} (${n2(top.revenue)})` : "n/a"}`,
    `LOWEST_GROUP_BY_REVENUE: ${low ? `${low.key} (${n2(low.revenue)})` : "n/a"}`,
    `MOST_UNITS_GROUP: ${most ? `${most.key} (${most.units} units)` : "n/a"}`,
  ];
  if (args.top_n) {
    const s = printed.reduce((a, g) => a + g.revenue, 0);
    footer.push(`TOP${args.top_n}_SHARE: ${n2(grandRevenue ? (s / grandRevenue) * 100 : 0)}%`);
  }

  const head = `GROUP_BY: ${args.group_by} | STATUS: ${status}${qf ? ` | QUARTER: ${qf}` : ""}${args.region ? ` | REGION: ${args.region}` : ""} | GROUPS: ${byRev.length}`;
  return { content: [{ type: "text", text: [head, ...lines, ...footer].join("\n") }] };
}
