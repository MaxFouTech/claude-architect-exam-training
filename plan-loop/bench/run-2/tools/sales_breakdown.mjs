// Two-dimensional cross-cut: for every 'outer' group, rank the 'inner' groups.
// Answers questions like "top category and top product per region" in one call.
import { readFileSync } from "node:fs";
import { z } from "zod";
import { applyFilters, aggregate } from "./sales_summary.mjs";

export const name = "sales_breakdown";
export const description =
  "Cross-cut two dimensions of the sales orders in one call: for EACH 'outer' group it ranks the 'inner' groups by a metric. " +
  "Example: outer='region', inner='category', top_inner=1 prints the top category of every region with its value; " +
  "outer='region', inner='product' gives the top product per region. " +
  "Dimensions: region, category, product, customer, month, quarter, status. " +
  "metric: 'net_revenue' (completed orders only, default), 'gross_revenue', 'units' (completed quantity), 'orders' (completed count), " +
  "'all_orders', 'refund_rate', 'refunded_revenue'. " +
  "outer_order='key' (default, alphabetical/chronological) or 'metric' (outer groups ranked by their own total). " +
  "Each outer line also shows that outer group's own total for the metric. Numbers are rounded to 2 decimals - copy verbatim. " +
  "Same optional filters as sales_summary (region/category/product/customer/status/date_from/date_to).";

const DIMS = ["region", "category", "product", "customer", "month", "quarter", "status"];

export const schema = {
  outer: z.enum(DIMS).describe("Outer dimension, one block per value (e.g. 'region')."),
  inner: z.enum(DIMS).describe("Inner dimension ranked inside each outer group (e.g. 'category' or 'product')."),
  metric: z
    .enum(["net_revenue", "gross_revenue", "units", "orders", "all_orders", "refund_rate", "refunded_revenue"])
    .optional()
    .describe("Ranking metric, default 'net_revenue'."),
  top_inner: z.number().int().min(1).optional().describe("How many inner groups per outer group. Default 3; use 1 for 'the top X per Y'."),
  outer_order: z.enum(["key", "metric"]).optional().describe("Order of the outer blocks. Default 'key' (alphabetical/chronological)."),
  region: z.string().optional().describe("Filter: only this region."),
  category: z.string().optional().describe("Filter: only this category."),
  product: z.string().optional().describe("Filter: only this product."),
  customer: z.string().optional().describe("Filter: only this customer_id."),
  status: z.string().optional().describe("Filter: only this status."),
  date_from: z.string().optional().describe("Filter: inclusive start date YYYY-MM-DD or YYYY-MM."),
  date_to: z.string().optional().describe("Filter: inclusive end date YYYY-MM-DD or YYYY-MM."),
};

const load = () => JSON.parse(readFileSync(new URL("../data/orders.json", import.meta.url), "utf8"));
const n = (x) => (isFinite(x) ? String(Math.round(x * 100) / 100) : "n/a");

const METRIC = {
  net_revenue: (g) => g.net,
  gross_revenue: (g) => g.gross,
  units: (g) => g.units,
  orders: (g) => g.completed,
  all_orders: (g) => g.all_orders,
  refund_rate: (g) => (g.all_orders ? (g.refunded / g.all_orders) * 100 : 0),
  refunded_revenue: (g) => g.refunded_revenue,
};

const FIELD = { region: "region", category: "category", product: "product", customer: "customer_id", status: "status" };
function valueOf(o, dim) {
  if (FIELD[dim]) return o[FIELD[dim]];
  if (dim === "month") return o.date.slice(0, 7);
  const m = Number(o.date.slice(5, 7));
  return `${o.date.slice(0, 4)}-Q${Math.floor((m - 1) / 3) + 1}`;
}

export async function handler(args = {}) {
  if (args.outer === args.inner) {
    return { content: [{ type: "text", text: "outer and inner must be different dimensions. Use sales_summary for a single dimension." }], isError: true };
  }
  const metric = args.metric || "net_revenue";
  const topInner = args.top_inner || 3;
  const rows = applyFilters(load(), args);
  if (!rows.length) return { content: [{ type: "text", text: "No orders match those filters." }], isError: true };

  const buckets = new Map();
  for (const o of rows) {
    const k = valueOf(o, args.outer);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(o);
  }

  const blocks = [...buckets.entries()].map(([key, rs]) => {
    const total = METRIC[metric](aggregate(rs, "total")[0]);
    const inner = aggregate(rs, args.inner)
      .map((g) => ({ key: g.key, v: METRIC[metric](g) }))
      .sort((a, b) => b.v - a.v || String(a.key).localeCompare(String(b.key)));
    return { key, total, inner };
  });

  blocks.sort((a, b) =>
    (args.outer_order || "key") === "metric" ? b.total - a.total || a.key.localeCompare(b.key) : a.key.localeCompare(b.key)
  );

  const out = [`BREAKDOWN: ${args.outer} x ${args.inner} by ${metric} (top ${topInner} per ${args.outer}; ${rows.length} rows)`];
  for (const b of blocks) {
    const list = b.inner.slice(0, topInner).map((x, i) => `${i + 1}) ${x.key} = ${n(x.v)}`).join("  |  ");
    out.push(`${b.key}: ${list}    [${args.outer} total ${metric} = ${n(b.total)}]`);
  }
  out.push(`TOP_${args.inner.toUpperCase()}_PER_${args.outer.toUpperCase()} (rank 1 only):`);
  for (const b of blocks) out.push(`${b.key} -> ${b.inner[0].key} (${n(b.inner[0].v)})`);
  return { content: [{ type: "text", text: out.join("\n") }] };
}
