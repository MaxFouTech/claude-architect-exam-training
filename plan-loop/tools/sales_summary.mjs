import { readFileSync } from "node:fs";
import { z } from "zod";

export const name = "sales_summary";
export const description =
  "Headline totals for the WHOLE dataset (all 400 orders, Jan-Jun 2026) in one call. " +
  "Returns order counts and revenue for every status (completed / refunded / cancelled), gross revenue over all statuses, " +
  "net revenue (completed only), units, and average order value - all pre-computed and pre-rounded. " +
  "Use this for any question about overall totals or the status mix. Never add these numbers up yourself.";

export const schema = {};

const rev = (o) => o.quantity * o.unit_price;
const m2 = (x) => (Math.round(x * 100) / 100).toFixed(2);

export async function handler() {
  const orders = JSON.parse(readFileSync(new URL("../data/orders.json", import.meta.url), "utf8"));

  const pick = (st) => orders.filter((o) => o.status === st);
  const sum = (rows) => rows.reduce((s, o) => s + rev(o), 0);
  const units = (rows) => rows.reduce((s, o) => s + o.quantity, 0);

  const completed = pick("completed");
  const refunded = pick("refunded");
  const cancelled = pick("cancelled");

  const dates = orders.map((o) => o.date).sort();

  const out = {
    scope: "ALL rows in data/orders.json - nothing is truncated or sampled",
    rows_scanned: orders.length,
    date_range: { first: dates[0], last: dates[dates.length - 1] },
    total_orders: orders.length,
    completed_orders: completed.length,
    refunded_orders: refunded.length,
    cancelled_orders: cancelled.length,
    gross_revenue_all_statuses: m2(sum(orders)),
    net_revenue_completed: m2(sum(completed)),
    refunded_revenue: m2(sum(refunded)),
    cancelled_revenue: m2(sum(cancelled)),
    average_order_value_completed: m2(sum(completed) / completed.length),
    average_order_value_all_statuses: m2(sum(orders) / orders.length),
    units_completed: units(completed),
    units_all_statuses: units(orders),
    distinct_customers: new Set(orders.map((o) => o.customer_id)).size,
    distinct_products: new Set(orders.map((o) => o.product)).size,
    distinct_regions: new Set(orders.map((o) => o.region)).size,
    note: "Money and percentage fields are strings already rounded to 2 decimals - copy them verbatim.",
  };

  return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
}
