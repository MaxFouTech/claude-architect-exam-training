// Ignored by the loader (leading underscore). Shared helpers for the real tools.
import { readFileSync } from "node:fs";

export function loadOrders() {
  return JSON.parse(readFileSync(new URL("../data/orders.json", import.meta.url), "utf8"));
}

export const revenueOf = (o) => o.quantity * o.unit_price;

// Round to 2 decimals and print WITHOUT padding, so 106288 stays "106288",
// 1296.195 becomes "1296.2" and 2924.166 becomes "2924.17".
export function fmt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "n/a";
  if (!Number.isFinite(n)) return "n/a";
  return String(Math.round((n + Number.EPSILON) * 100) / 100);
}

export const monthOf = (o) => o.date.slice(0, 7);
export function quarterOf(o) {
  const m = Number(o.date.slice(5, 7));
  return `${o.date.slice(0, 4)}-Q${Math.ceil(m / 3)}`;
}

export const DIMENSIONS = {
  region: (o) => o.region,
  category: (o) => o.category,
  product: (o) => o.product,
  customer_id: (o) => o.customer_id,
  status: (o) => o.status,
  month: monthOf,
  quarter: quarterOf,
};

// Apply the standard optional filters. Filters are applied to ALL statuses;
// the net/gross split is handled by the metric maths, never by the filters.
export function applyFilters(orders, a = {}) {
  return orders.filter((o) => {
    if (a.region && o.region !== a.region) return false;
    if (a.category && o.category !== a.category) return false;
    if (a.product && o.product !== a.product) return false;
    if (a.customer_id && o.customer_id !== a.customer_id) return false;
    if (a.status && o.status !== a.status) return false;
    if (a.month && monthOf(o) !== a.month) return false;
    if (a.quarter && quarterOf(o) !== a.quarter) return false;
    if (a.date_from && o.date < a.date_from) return false;
    if (a.date_to && o.date > a.date_to) return false;
    return true;
  });
}

export function describeFilters(a = {}) {
  const keys = ["region", "category", "product", "customer_id", "status", "month", "quarter", "date_from", "date_to"];
  const on = keys.filter((k) => a[k]).map((k) => `${k}=${a[k]}`);
  return on.length ? on.join(", ") : "none (all 400 orders)";
}

// Core per-group statistics. Every derived number a step could need is
// precomputed here so a worker never has to do arithmetic itself.
export function statsFor(rows) {
  const completed = rows.filter((o) => o.status === "completed");
  const refunded = rows.filter((o) => o.status === "refunded");
  const cancelled = rows.filter((o) => o.status === "cancelled");
  const sum = (rs, f) => rs.reduce((a, o) => a + f(o), 0);
  const netRevenue = sum(completed, revenueOf);
  return {
    total_orders: rows.length,
    completed_orders: completed.length,
    refunded_orders: refunded.length,
    cancelled_orders: cancelled.length,
    gross_revenue: sum(rows, revenueOf),
    net_revenue: netRevenue,
    refunded_revenue: sum(refunded, revenueOf),
    units_completed: sum(completed, (o) => o.quantity),
    units_all: sum(rows, (o) => o.quantity),
    aov: completed.length ? netRevenue / completed.length : 0,
    refund_rate: rows.length ? (refunded.length / rows.length) * 100 : 0,
  };
}

export function text(s) {
  return { content: [{ type: "text", text: s }] };
}

export function fail(msg) {
  return { content: [{ type: "text", text: `ERROR: ${msg}` }], isError: true };
}
