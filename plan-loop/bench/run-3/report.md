# plan-loop report: half-year sales review (Jan-Jun 2026)

Plan: 7 steps, fixed before the loop. Expected results were computed with `node`
over `data/orders.json` and never edited. Only tools changed between rounds.

## Round 1 — 0 / 7 passed (worker cost $1.3169)

Tools available: the seed `query_orders` only (raw rows, `limit` capped at 50, no
offset, no aggregation). Dispatched all 7 steps unchanged, as required.

What the traces showed, two distinct failure modes:

1. **Hard block (s1, s2, s5, s6).** The 50-row cap with no offset made the full
   400-order file unreachable. s1 called `query_orders` 11 times with identical
   arguments and got byte-identical output every time before giving up; s5
   figured out it could page by region, collected 4 x 50 = 200 rows, and
   correctly reported it still could not see the other 200. All four returned
   "BLOCKED" with an accurate description of the missing capability.
2. **Silent truncation, confident wrong numbers (s3, s4, s7)** — the worse mode.
   These workers did not notice the cap and hand-summed a truncated sample:
   - s3: `C007 revenue=11547` (true 18623), and a fabricated top-5 in which 4 of
     5 customers were wrong.
   - s4: only 4 of 6 months, `2026-04 revenue=16926` (true 66747).
   - s7: `Q2_NET_REVENUE=5039` against a true 178037, and all four regions
     reported as `refunded=5/50` — an artifact of the per-region 50-row page,
     not of the data.

Common root cause: no aggregation primitive existed, so *every* number had to be
produced by the model doing arithmetic over rows it had pasted into its own
context. Even the row budget it did have was spent re-fetching the same page.

## Round 2 — 7 / 7 passed (worker cost $0.2095)

Changes, all driven by the round-1 evidence:

- **Added `sales_summary`** — answers "totals and status mix" in one call.
  Directly removes the s1 block and, via its `quarter` filter, the Q1/Q2 block
  of s7.
- **Added `breakdown`** — one general grouped aggregator instead of a tool per
  step. It covers region, month, quarter, category, product, customer, status
  and the two cross-cuts `region_category` / `region_product`. Because the
  round-1 workers failed specifically at *derived* arithmetic, the tool
  pre-computes everything downstream of the sum: rank, AOV, share %,
  month-over-month %, and a footer with `TOP_GROUP_BY_REVENUE`,
  `LOWEST_GROUP_BY_REVENUE`, `MOST_UNITS_GROUP` and `TOP<N>_SHARE`. Footer stats
  are computed over all groups *before* `top_n` truncation, so asking for a
  top-5 still yields a correct total and a correct lowest group — exactly the
  trap s6 needed to avoid.
- **Added `refund_report`** — refund rate with the denominator fixed as *all*
  statuses in the group. s5 and s7 both had to get that denominator right, and
  in round 1 s7 got it wrong; encoding it in the tool removes the choice.
- **Rewrote `query_orders`** — added `offset` and more filters, and changed the
  description to say it is for spot checks only. Its output now carries an
  explicit `TRUNCATED: showing rows X-Y of N matches` banner telling the worker
  not to aggregate a partial page. This targets the silent-truncation mode: the
  round-1 workers had no way to know their sample was incomplete.
- **Output format**: tools emit ready-made report lines and numbers already
  rounded to 2 decimals with trailing zeros dropped (`1296.2`, not `1296.20`),
  so workers copy rather than reformat. Descriptions say so explicitly.

Each tool was smoke-tested with `test_tool` against the known ground truth
before dispatch; all 7 steps' expected values were confirmed reachable in a
single call each.

Result: every step passed. Workers used 1–5 data calls and 5–9 turns (round 1:
5–14 calls, all wasted), and did no arithmetic by hand. Worker cost fell 6.3x.

Rounds 3 and 4 were not needed.

## Final tool set

| Tool | Signature | Purpose |
|---|---|---|
| `sales_summary` | `(region?, category?, product?, customer_id?, month?, quarter?)` | Headline totals for the whole file or a filtered slice: order counts by status, gross/net revenue, AOV, units, refunded revenue. |
| `breakdown` | `(group_by, status?, top_n?, top_per_group?, sort?, region?, category?, product?, quarter?)` | General grouped aggregation with pre-computed rank, AOV, share %, MoM % and all-group footer stats. |
| `refund_report` | `(group_by?)` | Refund count, rate (denominator = all statuses) and refunded revenue per category/region/product/month/customer, ranked by rate. |
| `query_orders` | `(region?, category?, product?, customer_id?, status?, month?, limit?, offset?)` | Row-level spot checks only; pages with an explicit truncation warning. |
