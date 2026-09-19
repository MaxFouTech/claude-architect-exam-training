# Tool-building loop report — half-year sales review (Jan–Jun 2026)

Plan: 7 fixed steps (s1–s7) over `data/orders.json` (400 orders; fields: order_id, date,
region, customer_id, product, category, quantity, unit_price, status). All expected results
in `plan.json` were confirmed against the data with `node -e` before the first dispatch;
the plan itself was never edited.

## Round 1 — 0/7 passed (worker cost $0.61)

Ran with the seed tool exactly as found: `query_orders(region?, limit<=50)`, which returns
raw JSON rows only.

What the traces showed: not a single number was produced. All 7 workers marked their step
`blocked` and said so explicitly. Concretely:

- **Hard cap with no offset.** `limit` maxes out at 50 of 400 rows and there is no
  pagination, so s1 called `query_orders{limit:50}` **nine times in a row** and got the
  identical first 50 rows back every time before giving up.
- **No aggregation at all.** The tool can filter by region and nothing else — no status,
  no date range, no grouping, no sums. s2/s6/s7 walked the four regions one call each,
  saw 50 truncated rows per region, and stopped.
- **The instructions forbid the only remaining route.** Every step says "never add up raw
  order rows by hand", so even the rows they did receive were unusable. s3 tried to reach
  the file directly through `update_plan_steps` notes, which of course did nothing.

The failure was purely a tool-capability failure, not a worker-reasoning failure: the
workers correctly diagnosed what was missing (grouping, status/date filters, sums, rates).

## Changes made after Round 1

Deleted `query_orders.mjs` outright — a raw-row tool only invites truncation and manual
arithmetic — and replaced it with two general aggregation tools. Design rule: every number
a step has to print should come out of **one** call, already grouped, already ranked,
already rounded, so the worker only reformats text and never does arithmetic.

**`sales_summary`** — one grouping dimension (`total`/`region`/`category`/`product`/
`customer`/`month`/`quarter`/`status`/`date`), every metric on every line:
`net_revenue` (completed only), `completed_orders`, `aov`, `net_share_pct`,
`units_completed`, `all_orders`, `refunded_orders`, `cancelled_orders`,
`refund_rate_pct`, `refunded_revenue`, `gross_revenue`. Specific additions driven by the
round-1 gaps and by what each step's output format demands:

- `sort_by` + printed rank numbers — s2/s3/s6 rank by net revenue, s5/s7 by refund rate.
- `change_pct` on `month`/`quarter` rows, computed chronologically and independent of the
  display sort, `n/a` for the first period — gives s4 its MoM column and s7 its
  Q1→Q2 change without a worker ever dividing.
- `top=N` plus a `SHOWN_ROWS_NET_SHARE_PCT` footer computed against the *full* total —
  this is s3's TOP5_SHARE directly.
- An always-on `TOTALS` footer (TOTAL_ORDERS/COMPLETED/REFUNDED/CANCELLED/GROSS/NET/AOV/
  UNITS_COMPLETED/OVERALL_REFUND_RATE_PCT/TOTAL_REFUNDED_REVENUE) — s1 is answerable in a
  single `group_by:'total'` call, and s5's overall lines come free with the category call.
- A `HIGHLIGHTS` footer computed over **all** groups even when `top` truncates the display —
  s6's LOWEST_REVENUE_PRODUCT and MOST_UNITS_PRODUCT would otherwise be invisible behind `top=5`.
- Filters `region/category/product/customer/status/date_from/date_to` (month-length dates
  accepted) so any slice is reachable.
- Number formatting: round to 2 decimals then strip trailing zeros, so the tool prints
  `1296.2`, `1345`, `106288` — exactly the forms the expected results use. This matters:
  the steps tell workers to copy numbers verbatim, so the *tool* owns the rounding.

**`sales_breakdown`** — the one thing a single-dimension tool cannot do: `outer` × `inner`
cross-cut (e.g. top category and top product **per region**, s7 block A). Reuses
`applyFilters`/`aggregate` exported from `sales_summary` so the two tools can never drift
apart, and appends an explicit `TOP_<INNER>_PER_<OUTER>` rank-1-only list so the common
"top X per Y" question needs no reading of the detail lines.

Both tools were smoke-tested with `test_tool` against every step's expected result
(region, month, customer top-5, category by refund rate, product, quarter, region×product)
before dispatching; all matched ground truth exactly.

## Round 2 — 7/7 passed (worker cost $0.20)

Every step verified. Workers used 1–3 calls each (s1: one call; s2/s3/s4/s5: one call;
s6: three; s7: four) and no worker did any arithmetic — every reported figure was copied
from tool output. Cost dropped ~3× versus the failed round. No further rounds needed.

## Final tool set

| Tool | Signature | Purpose |
|---|---|---|
| `sales_summary` | `(group_by?, sort_by?, order?, top?, region?, category?, product?, customer?, status?, date_from?, date_to?)` | Aggregate orders on one dimension: revenue/orders/units/AOV/share/refund metrics per group, ranked, plus TOTALS and HIGHLIGHTS footers. |
| `sales_breakdown` | `(outer, inner, metric?, top_inner?, outer_order?, region?, category?, product?, customer?, status?, date_from?, date_to?)` | Two-dimensional cross-cut: ranks `inner` groups within each `outer` group, e.g. top product per region. |
