# Tool-building loop: half-year sales review (Jan–Jun 2026)

Dataset: `data/orders.json`, 400 orders, 40 customers, 4 regions, 4 categories, 11 products,
2026-01-01 → 2026-06-28. No nulls, no type anomalies. Every `expected_result` in `plan.json` was
computed with `node -e` over the raw file before any dispatch.

Plan: 7 steps — s1 headline totals, s2 regional breakdown, s3 top customers/concentration,
s4 monthly trend + MoM, s5 refund behaviour by category, s6 product-level insights,
s7 region × category matrix + regional refund rates.

Verification method: numeric-token comparison of the worker's final answer against
`expected_result` (order-sensitive, tolerant of `106288` vs `106288.00`), plus a check that every
expected label appears. No answer was waived.

---

## Round 1 — 0/7 verified

Tools available: `query_orders` (seed) only — raw rows, optional region filter, hard cap of 50.

What the traces showed:
- Six of seven workers converged on the identical dead end: call `query_orders` once per region at
  `limit=50`, collecting 200 of 400 rows, then do all summing, division and ranking **mentally**.
- The failure was **silent**. The tool gave no signal that it had truncated, so workers annotated
  their wrong results as complete: s6 noted "Processing all completed orders from all regions
  (Jan-Jun 2026)" while holding half the data. Only s1 correctly declared itself blocked.
- Damage was not marginal: APAC net revenue 49,804 vs 106,288; s4 returned 4 months instead of 6
  because raw-row pulls never reached May–June; s5 inverted the category ranking (subscription
  ahead of hardware); s3 invented three top-5 customers and counted 38 customers instead of 40.

Diagnosis: the workers were not bad at arithmetic policy — they had no aggregation affordance at
all, and a cap that lied by omission. Mental arithmetic over a truncated sample was the only move
the tool surface allowed.

## Round 2 — 7/7 correct, but with a signature defect

Changes made after round 1:
1. **Deleted `query_orders`.** It was the direct cause of all seven failures and workers need no
   raw rows for this plan. Removing the temptation was more effective than warning against it.
2. **Added `sales_summary()`** — every headline figure for the whole dataset in one zero-argument
   call (counts and revenue per status, gross, net, AOV, units, distinct counts). Covers s1 with
   no composition.
3. **Added `sales_breakdown(...)`** — one general aggregator instead of a tool per step. It groups
   all 400 rows by `region | category | product | customer_id | month | status`, with an optional
   `then_by` for two-level matrix cells, a `status` filter defining net vs gross, eight sort modes,
   `top_n`, and opt-in refund and month-over-month metrics.

Design decisions driven specifically by round-1 evidence:
- **Every derived number is precomputed server-side**: `aov`, `avg_units_per_order`,
  `share_of_total_pct`, `mom_pct`, `refund_rate_by_orders_pct`, `refunded_share_of_gross_pct`.
  Workers never divide.
- **An `extras` block answers the follow-up question of each step** so no cross-call arithmetic is
  needed: `gap_first_to_second` (s2), `top_n_revenue_sum`/`top_n_share_pct`/`distinct_groups` (s3),
  `best_group_by_revenue`/`worst_group_by_revenue` (s4), `total_refunded_revenue_all_groups` and
  `highest_refund_rate_by_orders_group` (s5), `highest_avg_units_per_order` (s6),
  `top_cell` and `per_group_top` (s7).
- **Money and percentages are emitted as strings already rounded to 2 decimals** ("1296.20"), so
  workers copy verbatim and trailing zeros survive.
- **Anti-truncation signal**: every response carries `scope: "ALL 400 rows scanned - no truncation,
  no sampling"` and an explicit `revenue_definition`, directly countering the round-1 failure mode.
- Refund metrics are computed over all statuses regardless of the `status` filter — this made s5
  correct even though that worker passed `status:"all"` on its second call.

Result: all 7 answers exact. But the traces showed **every worker hit one tool error first**:
zod v4 `.default()` fields are validated as *required* at the MCP boundary, so omitting
`include_refund_metrics`/`include_mom`/`status` raised `invalid_type: expected nonoptional`. The
workers recovered by resending with all defaults spelled out, so the numbers were unaffected — but
each wasted a turn, and a less persistent worker would have stalled. My round-2 smoke test missed
this because it called `handler()` directly and bypassed schema validation.

## Round 3 — 6/7 verified (7th was cosmetic)

Changes made after round 2:
4. **Replaced every `.default(...)` with `.optional()` in `sales_breakdown`**, applying the defaults
   inside the handler instead, and reworded the descriptions ("Omit for 'completed'…").
5. **Rewrote the smoke test to mirror the MCP boundary** — zod-parse the arguments through
   `z.object(mod.schema)` first, then call the handler — across 12 cases including the guarded
   `then_by === group_by` error path. This is the check that would have caught defect 4.

Result: zero tool errors, one data call per worker (down from 4–6 raw pulls in round 1), average
5.6 turns. s1, s2, s4, s5, s6, s7 verified exactly. s3's figures were all exact but the worker
prepended a prose header ("Top 5 customers by NET revenue…"), which my strict verifier rejected.

## Round 4 — 7/7 verified

That was a format-compliance issue, not a data or tool issue, so I fixed it where it belonged: in
the s3 instruction, adding an explicit "begin your answer directly with '1. C…' — no title, header,
preamble or trailing commentary". No tool change. Re-dispatched s3 alone; exact match.

**Final: 7/7 steps verified.**

---

## Final tool set

| Tool | Signature | Purpose |
|---|---|---|
| `sales_summary` | `()` | All headline figures for the full dataset in one call: order counts and revenue per status, gross/net revenue, AOV, units, distinct customers/products/regions. |
| `sales_breakdown` | `(group_by, then_by?, status?, sort?, top_n?, include_refund_metrics?, include_mom?)` | General aggregator over all 400 orders: grouped revenue/orders/units with aov, avg-units-per-order, share %, optional refund metrics, MoM, two-level matrix cells, and an `extras` block of precomputed gaps, top-N sums, best/worst and per-group leaders. |

Both tools scan the whole file every call, never truncate, state their scope and revenue definition
in the response, and return money/percentage fields pre-rounded as strings.

## What generalises

- A cap that silently truncates is worse than an error: it converts "I can't" into a confident
  wrong answer. Ship a `scope` field that states what was actually scanned.
- Removing the tempting-but-wrong tool beat documenting it away.
- Push every division, ranking and percentage into the tool. Cheap workers reliably copy numbers
  and unreliably compute them.
- Smoke-test tools through the same validation path the worker uses; testing `handler()` directly
  hid a schema defect that cost every worker a turn.
