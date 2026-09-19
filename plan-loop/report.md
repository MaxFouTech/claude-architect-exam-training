# Tool-building loop report

Task: half-year sales review of `data/orders.json` (400 orders, Jan–Jun 2026) across 7 fixed plan steps.
`plan.json` was fixed for this experiment; all expected results were confirmed against the raw data with `node -e` before round 1. Only the tools changed.

## Round 1 — 0/7 passed (worker cost $1.16)

Ran deliberately with the seed tool untouched, as the evidence baseline.

Seed tool: `query_orders(region?, limit<=50)` — returns raw JSON rows, hard cap 50, no offset.

What the traces showed:

- **Hard cap with no escape.** Every one of the 7 workers called `query_orders({limit:50})` first, got 50 of 400 rows, then tried to widen coverage by looping over the four regions — reaching at most 200 rows, all clustered in Jan–early Apr. Several then re-called the identical unfiltered query 3–5 times hoping for different rows (s5 called it 5×, s6 6×).
- **No aggregation at all.** The plan instructions say "use the aggregation tools; never add up raw order rows by hand", but no aggregation existed. This was an explicit dead end: s7 reported a "constraint conflict" between the instructions and the available API.
- **6 of 7 gave up.** s1, s3, s4, s5, s7 returned BLOCKED and s6 FAILED, all correctly diagnosing the missing capability (pagination or aggregation endpoints).
- **The one worker that pushed on produced silently wrong numbers.** s2 hand-summed its 200-row subset and reported APAC revenue=50204 vs the true 106288 — every one of its 16 numbers was wrong. This is the worst failure mode: a confident answer from partial data.

Nothing here was a prompt or comprehension problem; the workers reasoned correctly about the data they could reach. The tool was the whole bottleneck.

## Changes made after round 1

Deleted `query_orders.mjs` outright rather than raising its cap. Paging 400 rows into a Haiku context and asking it to sum by hand is exactly what produced s2's wrong answer, and keeping a raw-row tool leaves that path open. Replaced it with three general aggregation tools that always scan the full file:

- **`sales_overview`** — one call returns every headline figure (status mix, gross/net revenue, AOV, units, overall refund rate, refunded revenue, Q1/Q2 and the Q1→Q2 change). Covers s1 outright and the tail lines of s5 and s7.
- **`breakdown`** — the workhorse: group by region / category / product / customer / month / status. Each row carries net revenue, completed orders, units, AOV and share, *plus* the all-status columns (total orders, refunded count, refund rate, refunded revenue) so refund questions need no second call. `group_by=month` adds a month-over-month column computed chronologically, independent of the display sort. Serves s2, s3, s4, s5, s6 and s7's block B.
- **`cross_breakdown`** — two-dimension ranking (e.g. region × category, region × product) for s7's block A.

Three cross-cutting design decisions, each aimed at a specific round-1 failure:

1. **Derived answers are pre-computed, not left to the worker.** A `SUMMARY` block gives LEADER, LOWEST, MOST_UNITS, HIGHEST_REFUND_RATE, BEST/WORST month and `TOP_N_SHARE`. Crucially these are computed over *all* groups even when `limit` truncates the display, so a top-5 request still yields a correct lowest-revenue product and a correct top-5 share.
2. **All output pre-rounded to 2 decimals with trailing zeros stripped**, matching the plan's expected formatting (`1296.2`, `1345`, not `1296.20`). The instructions tell workers to copy numbers verbatim; the tools make that literally correct so no worker does arithmetic.
3. **Descriptions state "scans all 400 orders, no row cap, nothing to paginate"** — directly countering the round-1 belief that data was unreachable.

Smoke-testing with `test_tool` caught a real bug before dispatch: the numeric sort comparator was inverted, so `{group_by:"customer", limit:5}` returned the *bottom* 5 customers (C016, C034, …) under a header reading "sorted by revenue desc". That would have failed s3 and s6 with plausible-looking output. Fixed the comparator sign and re-verified each tool shape against ground truth.

## Round 2 — 7/7 passed (worker cost $0.26)

All seven steps verified. s2–s7 each needed only 1–5 data calls (s2, s3, s4 solved in a single call). s1 over-explored with 14 calls, querying every breakdown and all six months individually before answering, but still passed — harmless given the answer was already in its first `sales_overview({})` call.

Worker cost fell 4.5× versus round 1 despite going from 0 to 7 passes, because the tools returned answers instead of rows to wade through. Loop stopped at round 2 of the 4-round budget.

## Final tool set

| Tool | Signature | Purpose |
|---|---|---|
| `sales_overview` | `(region?, category?, product?, customer?, month?)` | All headline totals in one call: status mix, gross/net revenue, AOV, units, refund rate, Q1/Q2 and Q1→Q2 change. |
| `breakdown` | `(group_by, sort_by?, order?, limit?, region?, category?, product?, customer?, month?)` | One-dimension aggregation with revenue/orders/units/AOV/share plus refund columns, MoM for months, and an all-groups summary block. |
| `cross_breakdown` | `(group_by, sub_group_by, top_n?, status?)` | Two-dimension ranking, e.g. the top category and top product within each region. |
