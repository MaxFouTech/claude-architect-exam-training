// Headline totals for the whole file or any filtered slice.
import { readFileSync } from "node:fs";
import { z } from "zod";

export const name = "sales_summary";
export const description = [
  "Headline sales totals for data/orders.json (Jan-Jun 2026), already aggregated and rounded.",
  "Call it with NO arguments to get the whole-file half-year totals: TOTAL_ORDERS, COMPLETED, REFUNDED, CANCELLED,",
  "GROSS_REVENUE (all statuses), NET_REVENUE (completed only), AOV, UNITS_COMPLETED, REFUND_RATE, REFUNDED_REVENUE.",
  "Optional filters narrow the slice (e.g. month_from='2026-01', month_to='2026-03' for Q1).",
  "Set compare_month_from/compare_month_to to also get a second period plus the percent change between them",
  "(useful for Q1 vs Q2). Revenue = quantity * unit_price. Numbers are final: copy them exactly, never re-round.",
].join(" ");

export const schema = {
  region: z.string().optional().describe("Filter: region, e.g. AMER, APAC, EMEA, LATAM"),
  category: z.string().optional().describe("Filter: category, e.g. hardware, services"),
  product: z.string().optional().describe("Filter: exact product name"),
  customer_id: z.string().optional().describe("Filter: customer id, e.g. C007"),
  status: z.string().optional().describe("Filter: completed | refunded | cancelled"),
  month_from: z.string().optional().describe("Inclusive start month YYYY-MM, e.g. 2026-01"),
  month_to: z.string().optional().describe("Inclusive end month YYYY-MM, e.g. 2026-03"),
  compare_month_from: z.string().optional().describe("Start month YYYY-MM of a second period to compare against"),
  compare_month_to: z.string().optional().describe("End month YYYY-MM of the second period"),
};

const num = (x) => {
  const v = Math.round((x + Number.EPSILON) * 100) / 100;
  return Number.isFinite(v) ? String(v) : "n/a";
};

function load() {
  return JSON.parse(readFileSync(new URL("../data/orders.json", import.meta.url), "utf8"));
}

function slice(orders, a, mf, mt) {
  return orders.filter((o) => {
    const m = o.date.slice(0, 7);
    if (a.region && o.region !== a.region) return false;
    if (a.category && o.category !== a.category) return false;
    if (a.product && o.product !== a.product) return false;
    if (a.customer_id && o.customer_id !== a.customer_id) return false;
    if (a.status && o.status !== a.status) return false;
    if (mf && m < mf) return false;
    if (mt && m > mt) return false;
    return true;
  });
}

function stats(rows) {
  const rev = (o) => o.quantity * o.unit_price;
  const comp = rows.filter((o) => o.status === "completed");
  const ref = rows.filter((o) => o.status === "refunded");
  const can = rows.filter((o) => o.status === "cancelled");
  const net = comp.reduce((a, o) => a + rev(o), 0);
  return {
    total: rows.length,
    completed: comp.length,
    refunded: ref.length,
    cancelled: can.length,
    gross: rows.reduce((a, o) => a + rev(o), 0),
    net,
    aov: comp.length ? net / comp.length : 0,
    units: comp.reduce((a, o) => a + o.quantity, 0),
    unitsAll: rows.reduce((a, o) => a + o.quantity, 0),
    refundRate: rows.length ? (ref.length / rows.length) * 100 : 0,
    refundedRevenue: ref.reduce((a, o) => a + rev(o), 0),
  };
}

function block(label, s) {
  return [
    `${label}TOTAL_ORDERS: ${s.total}`,
    `${label}COMPLETED: ${s.completed}`,
    `${label}REFUNDED: ${s.refunded}`,
    `${label}CANCELLED: ${s.cancelled}`,
    `${label}GROSS_REVENUE: ${num(s.gross)}`,
    `${label}NET_REVENUE: ${num(s.net)}`,
    `${label}AOV: ${num(s.aov)}`,
    `${label}UNITS_COMPLETED: ${s.units}`,
    `${label}UNITS_ALL_STATUSES: ${s.unitsAll}`,
    `${label}REFUND_RATE: ${num(s.refundRate)}%`,
    `${label}REFUNDED_REVENUE: ${num(s.refundedRevenue)}`,
  ].join("\n");
}

export async function handler(args = {}) {
  const orders = load();
  const a = args || {};
  const rows = slice(orders, a, a.month_from, a.month_to);
  const used = [
    a.region && `region=${a.region}`,
    a.category && `category=${a.category}`,
    a.product && `product=${a.product}`,
    a.customer_id && `customer_id=${a.customer_id}`,
    a.status && `status=${a.status}`,
    a.month_from && `month_from=${a.month_from}`,
    a.month_to && `month_to=${a.month_to}`,
  ].filter(Boolean);

  const out = [`FILTERS: ${used.length ? used.join(", ") : "none (whole file, all 400 orders, Jan-Jun 2026)"}`];
  const s = stats(rows);
  out.push(block("", s));

  if (a.compare_month_from || a.compare_month_to) {
    const rows2 = slice(orders, a, a.compare_month_from, a.compare_month_to);
    const s2 = stats(rows2);
    out.push("");
    out.push(`COMPARE_PERIOD: ${a.compare_month_from || "start"}..${a.compare_month_to || "end"}`);
    out.push(block("COMPARE_", s2));
    out.push("");
    const chg = s.net === 0 ? NaN : ((s2.net - s.net) / s.net) * 100;
    out.push(`PERIOD_A_NET_REVENUE: ${num(s.net)}`);
    out.push(`PERIOD_B_NET_REVENUE: ${num(s2.net)}`);
    out.push(`A_TO_B_NET_CHANGE: ${num(chg)}%`);
  }

  if (!rows.length) out.push("WARNING: no orders matched these filters; check spelling of filter values.");
  return { content: [{ type: "text", text: out.join("\n") }] };
}
