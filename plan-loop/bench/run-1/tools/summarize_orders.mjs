import { z } from "zod";
import { loadOrders, applyFilters, describeFilters, statsFor, fmt, text } from "./_shared.mjs";

export const name = "summarize_orders";
export const description =
  "Headline totals over the WHOLE order file (all 400 orders), or over any filtered slice. " +
  "Reads the complete dataset every time - there is NO row cap and no pagination, so one call is always enough. " +
  "Returns, already computed and already rounded: TOTAL_ORDERS, COMPLETED, REFUNDED, CANCELLED, GROSS_REVENUE " +
  "(all statuses), NET_REVENUE (status=='completed' only), AOV (net revenue / completed orders), " +
  "UNITS_COMPLETED, UNITS_ALL, REFUNDED_REVENUE and REFUND_RATE. " +
  "Use the optional filters to summarise a slice, e.g. date_from='2026-01-01' + date_to='2026-03-31' for Q1, " +
  "or region='APAC'. Copy the printed numbers verbatim; never re-round them and never total up raw rows yourself.";

export const schema = {
  region: z.string().optional().describe("Filter to one region: AMER, APAC, EMEA or LATAM"),
  category: z.string().optional().describe("Filter to one category: hardware, services, subscription, accessories"),
  product: z.string().optional().describe("Filter to one product name, e.g. 'Laptop Pro'"),
  customer_id: z.string().optional().describe("Filter to one customer, e.g. 'C007'"),
  status: z.string().optional().describe("Rarely needed. Filter rows to one status before summarising."),
  month: z.string().optional().describe("Filter to one month, format YYYY-MM, e.g. '2026-03'"),
  quarter: z.string().optional().describe("Filter to one quarter: '2026-Q1' or '2026-Q2'"),
  date_from: z.string().optional().describe("Inclusive start date, YYYY-MM-DD"),
  date_to: z.string().optional().describe("Inclusive end date, YYYY-MM-DD"),
};

export async function handler(args = {}) {
  const rows = applyFilters(loadOrders(), args);
  const s = statsFor(rows);
  const out = [
    `SUMMARY (filters: ${describeFilters(args)})`,
    `TOTAL_ORDERS: ${s.total_orders}`,
    `COMPLETED: ${s.completed_orders}`,
    `REFUNDED: ${s.refunded_orders}`,
    `CANCELLED: ${s.cancelled_orders}`,
    `GROSS_REVENUE: ${fmt(s.gross_revenue)}`,
    `NET_REVENUE: ${fmt(s.net_revenue)}`,
    `AOV: ${fmt(s.aov)}`,
    `UNITS_COMPLETED: ${s.units_completed}`,
    `UNITS_ALL: ${s.units_all}`,
    `REFUNDED_REVENUE: ${fmt(s.refunded_revenue)}`,
    `REFUND_RATE: ${fmt(s.refund_rate)}%`,
  ];
  return text(out.join("\n"));
}
