// Whole-file totals and status mix. Always scans ALL orders, never truncated.
import { readFileSync } from "node:fs";
import { z } from "zod";

export const name = "sales_summary";
export const description =
  "Headline totals over the WHOLE order file (all 400 orders, never truncated, no row cap). " +
  "Returns TOTAL_ORDERS, COMPLETED, REFUNDED, CANCELLED, GROSS_REVENUE (all statuses), " +
  "NET_REVENUE (completed only), AOV (net revenue / completed orders), UNITS_COMPLETED and UNITS_ALL. " +
  "order revenue = quantity * unit_price. All numbers are already rounded to 2 decimals - copy them exactly as printed, do not re-round or pad. " +
  "Optional filters narrow the scope (e.g. quarter='Q1' gives Q1 net revenue; region='APAC' gives that region's totals). " +
  "Use this instead of fetching rows and adding them up.";

export const schema = {
  region: z.string().optional().describe("Filter to one region, e.g. APAC"),
  category: z.string().optional().describe("Filter to one category, e.g. hardware"),
  product: z.string().optional().describe("Filter to one product, e.g. 'Laptop Pro'"),
  customer_id: z.string().optional().describe("Filter to one customer, e.g. C007"),
  month: z.string().optional().describe("Filter to one month, format YYYY-MM, e.g. 2026-03"),
  quarter: z.string().optional().describe("Filter to a quarter: 'Q1' (2026-01..2026-03) or 'Q2' (2026-04..2026-06)"),
};

const n2 = (v) => String(Math.round((Number(v) + Number.EPSILON) * 100) / 100);

export async function handler(args = {}) {
  const orders = JSON.parse(readFileSync(new URL("../data/orders.json", import.meta.url), "utf8"));
  const rev = (o) => o.quantity * o.unit_price;
  const q = (args.quarter || "").toUpperCase();
  const rows = orders.filter((o) => {
    if (args.region && o.region !== args.region) return false;
    if (args.category && o.category !== args.category) return false;
    if (args.product && o.product !== args.product) return false;
    if (args.customer_id && o.customer_id !== args.customer_id) return false;
    if (args.month && o.date.slice(0, 7) !== args.month) return false;
    if (q === "Q1" && !["2026-01", "2026-02", "2026-03"].includes(o.date.slice(0, 7))) return false;
    if (q === "Q2" && !["2026-04", "2026-05", "2026-06"].includes(o.date.slice(0, 7))) return false;
    return true;
  });

  const by = (s) => rows.filter((o) => o.status === s);
  const completed = by("completed");
  const refunded = by("refunded");
  const gross = rows.reduce((a, o) => a + rev(o), 0);
  const net = completed.reduce((a, o) => a + rev(o), 0);
  const aov = completed.length ? net / completed.length : 0;

  const scope = [
    args.region && `region=${args.region}`,
    args.category && `category=${args.category}`,
    args.product && `product=${args.product}`,
    args.customer_id && `customer=${args.customer_id}`,
    args.month && `month=${args.month}`,
    q && `quarter=${q}`,
  ].filter(Boolean).join(", ") || "whole file (Jan-Jun 2026)";

  const text = [
    `SCOPE: ${scope}`,
    `TOTAL_ORDERS: ${rows.length}`,
    `COMPLETED: ${completed.length}`,
    `REFUNDED: ${refunded.length}`,
    `CANCELLED: ${by("cancelled").length}`,
    `GROSS_REVENUE: ${n2(gross)}`,
    `NET_REVENUE: ${n2(net)}`,
    `AOV: ${n2(aov)}`,
    `UNITS_COMPLETED: ${completed.reduce((a, o) => a + o.quantity, 0)}`,
    `UNITS_ALL: ${rows.reduce((a, o) => a + o.quantity, 0)}`,
    `REFUNDED_REVENUE: ${n2(refunded.reduce((a, o) => a + rev(o), 0))}`,
  ].join("\n");

  return { content: [{ type: "text", text }] };
}
