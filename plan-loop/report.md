# plan-loop report: half-year sales review (Jan–Jun 2026)

Plan: 7 steps covering totals, regional breakdown, top customers, monthly trend,
refund behaviour by category, product insights, and a region×category / refund-risk /
Q1-vs-Q2 cross-cut. Every `expected_result` was computed with `node -e` over
`data/orders.json` before the plan was written.

## Round 1 — 0/7 passed (seed tools, unmodified)

Dispatched all 7 steps against the seed `query_orders` (raw rows, cap 50, region filter only).

What the traces showed:

- **5 steps blocked outright** (s1, s3, s4, s5, s6). Workers correctly diagnosed the tool
  themselves: "max 50 rows per query, no pagination/offset". s4 only ever saw Jan–Apr and
  said so; s6 saw 50 rows ending 2026-01-20.
- **2 steps returned confidently wrong answers** (s2, s7) — the more dangerous failure.
  They aggregated the truncated sample by hand and reported it as fact:
  s2 gave APAC revenue 50204 (true 106288); s7 gave Q2 net revenue 18369 (true 178037,
  ~10× off) and a wrong regional refund ranking.
- Root causes: no way to reach all 400 rows, no aggregation of any kind, no status/date/
  category filters, and no all-status denominator for rates. Workers were forced into
  manual arithmetic over a biased sample, with nothing telling them the sample was partial.

## Round 2 — 7/7 passed (rebuilt tool set)

Changes made, each driven by a specific round-1 observation:

| Change | Evidence it addresses |
|---|---|
| Added **`summarize_orders`**: whole-file totals, status mix, gross/net revenue, AOV, units, in one call | s1 blocked; totals are a single question and needed a single answer |
| Added **`breakdown_orders`**: group by region/category/product/customer_id/month/quarter/status with finished metrics (revenue, orders, units, aov, share), sorting, top-N, optional `then_by` nesting, `include_change` (MoM/QoQ %), `include_top_share` | s2, s3, s4, s6, s7 — all needed grouping, ranking, shares and period deltas that no tool provided |
| Added **`refund_report`**: refund rate over an **all-status denominator**, plus refunded revenue, by any dimension | s5, s7B — a status-filtered aggregate mathematically cannot produce a refund rate; this had to be its own tool |
| Rewrote **`query_orders`**: added category/product/customer/status/month filters, `offset` paging, cap 100, and a `MATCHED_ROWS: N (showing M)` header that states the list is truncated and names the right tool | s2/s7 silently aggregated a truncated sample believing it was complete |
| Encoded the NET-vs-GROSS convention in the tool defaults and descriptions (`status` defaults to `completed`) | round-1 workers each invented their own revenue definition |
| Made every tool round to 2 decimals and pre-format ranked lines so workers copy, never compute | round-1 workers did all arithmetic by hand |

All numbers were smoke-tested with `test_tool` against my ground truth before dispatch.
Result: 7/7 exact. Tool calls per step dropped to 1–3 for six of the seven steps.

## Round 3 — 1/1 re-verified (efficiency fix)

s7 passed in round 2 but consumed its whole budget (10 data calls, 14/14 turns) because the
worker looped region-by-region instead of discovering `then_by` + `top_per_group`. Since a
step that only just fits the turn cap is fragile, I rewrote the `breakdown_orders` description
to say "ONE CALL IS USUALLY ENOUGH — do not loop over regions/months" and to spell out the
`then_by` + `top_per_group=1` idiom with a worked example. Re-dispatched s7: identical exact
values, **4 data calls instead of 10, 8 turns instead of 14**. No signature or algorithm change.

Final: **7/7 steps verified.**

## Final tool set

| Tool | Signature | Purpose |
|---|---|---|
| `summarize_orders` | `(region?, category?, product?, customer_id?, month?)` | Headline totals for the whole (or filtered) dataset: status mix, gross/net revenue, AOV, units, refund rate. |
| `breakdown_orders` | `(group_by, then_by?, status?, sort_by?, order?, top?, top_per_group?, include_change?, include_top_share?, region?, category?, product?, customer_id?, month?)` | The workhorse: grouped revenue/orders/units/aov/share, ranked, with optional nesting, period-over-period change and top-N share. |
| `refund_report` | `(group_by, sort_by?, top?, region?, category?)` | Refund counts, rates (all-status denominator) and refunded revenue by any dimension, plus overall. |
| `query_orders` | `(region?, category?, product?, customer_id?, status?, month?, limit?, offset?)` | Spot-check individual rows; reports total matches and warns that the list is truncated. |
