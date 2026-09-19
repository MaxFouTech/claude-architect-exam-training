# Tool-building loop report — half-year sales review (Jan–Jun 2026)

Plan: 7 fixed steps (totals, regional breakdown, top customers, monthly trend, refunds by
category, product insights, cross-cuts). plan.json was not modified; only tools changed.

## Round 1 — 0/7 passed (cost $0.96)

Ran with the seed tool exactly as found: `query_orders(region?, limit<=50)`, which returns raw
JSON order rows and nothing else.

What the traces showed:

- **5 of 7 workers gave up** (s1, s4, s5, s6, s7) and returned `BLOCKED`, all citing the same two
  causes: the hard 50-row cap with no pagination over a 400-order file, and the total absence of
  aggregation. s4 tried to page around the cap by querying region-by-region, collected 200 rows,
  and correctly noticed it still only covered Jan–Apr.
- **2 workers hallucinated** (s2, s3). They summed the visible 50-row sample by hand and emitted
  confident, wrong numbers: s2 reported `AMER 65800 / LEADER: AMER` (truth: `APAC 106288`), s3
  reported `C001 9199` as top customer (truth: `C007 18623`). s2 also mis-ranked its own output
  (listed APAC 4th with a higher value than the 3rd row).
- Wasted effort: s2 spent 17 tool calls, s1 called `query_orders(limit=50)` three times in a row
  getting byte-identical output, because no argument could change the result.

Conclusion: the failure was purely tool capability, not worker capability. Every step needs
grouped aggregates over the full file, and no step needs a single raw row.

## Changes made after round 1

Replaced the raw-row tool with two general aggregation tools that return final, pre-rounded
numbers. Rounding is `Math.round(x*100)/100` printed as a plain number, matching the plan's format
(`1345`, not `1345.00`).

1. **Deleted `query_orders`** (renamed to `_query_orders.mjs`, so the loader ignores it). Evidence:
   it could not answer any step, and its partial output actively caused the two wrong answers.
   Removing it removes the hand-summing failure mode entirely.
2. **Added `sales_summary`** — headline totals for the file or any filtered slice. Covers s1 in a
   single zero-argument call. `compare_month_*` adds a second period and the % change between them.
3. **Added `sales_breakdown`** — one general group-by covering the other six steps, rather than one
   tool per step. Design decisions driven by round-1 evidence:
   - Seven dimensions (`region|category|product|customer|month|quarter|status`) so no step needs a
     bespoke tool; `quarter` exists so Q1-vs-Q2 is a grouping, not hand arithmetic.
   - Every row carries all metrics at once (net/gross revenue, completed & total orders, aov,
     units, refunded, refund_rate, refunded_revenue, share_net), so one call answers a whole step.
   - `change=%` versus the previous period is computed **chronologically regardless of sort order**,
     removing the month-over-month arithmetic workers would otherwise do by hand.
   - `limit` truncates the display only: shares, totals and the `HIGHEST/LOWEST/MOST_UNITS` footers
     are still computed over **all** groups. This is why `limit=5` on products still yields
     `LOWEST_NET_REVENUE: Cloud Basic (2194)` and `MOST_UNITS: Headset (142 units)`.
   - `SELECTED_SHARE_NET` gives the combined share of the shown rows — directly the `TOP5_SHARE`.
   - `then_by` sub-breakdown with a `TOP_<DIM>` line per group, so region × category and
     region × product (s7 Block A) are readable without a second pass.
   - Unknown `group_by`/`sort_by` values return an explicit `isError` message listing valid values.

Each tool was smoke-tested with `test_tool` against every expected result before dispatch; all 7
steps' target numbers were confirmed present in tool output.

## Round 2 — 7/7 passed (cost $0.21)

All steps verified. Workers used 4–6 calls each (vs 8–17 in round 1), typically one
`sales_breakdown` call per step; s6 used two and s7 four. No arithmetic was done by hand and no
number was re-rounded. Rounds 3 and 4 were not needed.

## Final tool set

| Tool | Signature | Purpose |
| --- | --- | --- |
| `sales_summary` | `(region?, category?, product?, customer_id?, status?, month_from?, month_to?, compare_month_from?, compare_month_to?)` | Headline totals for the file or any slice: order/status counts, gross & net revenue, AOV, units, refund rate, refunded revenue, plus optional period-vs-period change. |
| `sales_breakdown` | `(group_by, then_by?, then_limit?, sort_by?, order?, limit?, region?, category?, product?, customer_id?, month_from?, month_to?)` | Ranked group-by on any dimension with all revenue/refund/unit metrics per group, shares, period-over-period change, optional sub-breakdown, and whole-population footers. |
