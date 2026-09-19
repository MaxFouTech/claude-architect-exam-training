// Refund rates per dimension. Denominator is ALL statuses in the group.
import { readFileSync } from "node:fs";
import { z } from "zod";

export const name = "refund_report";
export const description =
  "Refund behaviour broken down by any dimension, over ALL orders (no row cap). " +
  "group_by: 'category' | 'region' | 'product' | 'month' | 'customer'. " +
  "refund rate = refunded orders / TOTAL orders in that group (all statuses) * 100, so the denominator is every order in the group. " +
  "Groups are ranked by refund rate descending and printed as a ready-made line: " +
  "'<rank>. <group>: orders=<int>, refunded=<int>, rate=<x>%, refunded_revenue=<x>'. " +
  "The footer adds OVERALL_REFUND_RATE (over all 400 orders), TOTAL_REFUNDED_REVENUE and WORST_GROUP (highest rate). " +
  "refunded revenue = quantity * unit_price summed over refunded orders. " +
  "All numbers are already rounded to 2 decimals - copy them exactly as printed, never recompute a rate by hand.";

export const schema = {
  group_by: z
    .enum(["category", "region", "product", "month", "customer"])
    .optional()
    .describe("Dimension to break refunds down by. Default 'category'."),
};

const n2 = (v) => String(Math.round((Number(v) + Number.EPSILON) * 100) / 100);

export async function handler(args = {}) {
  const orders = JSON.parse(readFileSync(new URL("../data/orders.json", import.meta.url), "utf8"));
  const rev = (o) => o.quantity * o.unit_price;
  const dim = args.group_by || "category";
  const keyOf = (o) =>
    dim === "category" ? o.category
      : dim === "region" ? o.region
      : dim === "product" ? o.product
      : dim === "month" ? o.date.slice(0, 7)
      : o.customer_id;

  const map = new Map();
  for (const o of orders) {
    const k = keyOf(o);
    if (!map.has(k)) map.set(k, { key: k, total: 0, refunded: 0, refundedRevenue: 0 });
    const g = map.get(k);
    g.total += 1;
    if (o.status === "refunded") {
      g.refunded += 1;
      g.refundedRevenue += rev(o);
    }
  }

  const groups = [...map.values()].map((g) => ({ ...g, rate: g.total ? (g.refunded / g.total) * 100 : 0 }));
  groups.sort((a, b) => b.rate - a.rate || b.refunded - a.refunded);

  const totalOrders = orders.length;
  const allRefunded = orders.filter((o) => o.status === "refunded");

  const lines = groups.map(
    (g, i) =>
      `${i + 1}. ${g.key}: orders=${g.total}, refunded=${g.refunded}, rate=${n2(g.rate)}%, refunded_revenue=${n2(g.refundedRevenue)}`
  );

  const footer = [
    `--- FOOTER ---`,
    `OVERALL_REFUND_RATE: ${n2((allRefunded.length / totalOrders) * 100)}%`,
    `TOTAL_REFUNDED_ORDERS: ${allRefunded.length}`,
    `TOTAL_ORDERS_ALL_STATUSES: ${totalOrders}`,
    `TOTAL_REFUNDED_REVENUE: ${n2(allRefunded.reduce((a, o) => a + rev(o), 0))}`,
    `WORST_GROUP: ${groups.length ? groups[0].key : "n/a"}`,
  ];

  return {
    content: [{ type: "text", text: [`REFUND_REPORT BY: ${dim} | GROUPS: ${groups.length}`, ...lines, ...footer].join("\n") }],
  };
}
