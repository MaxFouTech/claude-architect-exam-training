# plan-loop report — half-year sales review (Jan–Jun 2026)

Plan was fixed (7 steps, expected results pre-set). I verified every expected
result against `data/orders.json` with node before round 1 — all 7 matched the
data, so the plan was sound and only the tools were in question.

## Round 1 — 0 / 7 passed

Tools: seed `query_orders` only (raw rows, `limit` capped at 50, no offset, no
date filter). Worker cost $0.887.

What the traces showed, two distinct failure modes:

- **Hard block (s1, s2, s4, s5, s7).** The cap has no `offset`, so repeated
  calls returned the *identical* first 50 rows. s1 spent 8 calls rediscovering
  this before giving up; s4 concluded "only data through April 2026 available".
  Five workers returned `BLOCKED` and wrote tool-limitation notes into the plan.
- **Silent wrong answers (s3, s6).** These two did not notice the truncation.
  They hand-totalled the 50-row sample and reported confident, badly wrong
  numbers: `C007 revenue=12047` (true 18623), `Laptop Pro revenue=43870` (true
  105270), `TOP5_SHARE 27.72%` (true 23.24%).

Diagnosis: there was no aggregation capability at all, and the one tool made
partial data look complete. Workers also had to do every derived metric (AOV,
share, MoM, refund rate) by hand.

## Changes made after round 1

Built three general aggregators plus a shared helper, and demoted the seed tool.
All four read the full 400-row file on every call — no cap, no pagination.

1. **`_shared.mjs`** (underscore ⇒ not loaded as a tool). One `statsFor()` that
   precomputes every metric per group, one filter set, and a `fmt()` that rounds
   to 2 dp and prints *without* padding, so `106288` stays `106288`, `1296.195`
   prints `1296.2` and `1345.0` prints `1345`. This matters because the steps say
   "copy numbers exactly as the tools print them": padded `1296.20` or re-rounded
   values would have been the next failure mode.
2. **`summarize_orders`** — headline totals, gross vs net split done inside the
   tool, so s1 is a single call.
3. **`breakdown_orders`** — the main aggregator. One `group_by` covers region,
   category, product, customer_id, month, quarter, status. Every line carries
   revenue/orders/units/aov/share already computed; month lines carry `mom=`,
   quarter lines carry `change=`; footers give `HIGHEST_REVENUE`,
   `LOWEST_REVENUE`, `HIGHEST_UNITS`, `BEST_PERIOD`/`WORST_PERIOD` and
   `TOP_<n>_SHARE`. Period-over-period change is computed on a chronological
   pass *before* display sorting, so it stays correct under any `sort`. This one
   tool answers s2, s3, s4, s6 and s7 blocks A and C.
4. **`refund_report`** — applies the tricky definition (refunded / **all**
   statuses in the group) itself, ranks by rate, and emits overall footers.
   Covers s5 and s7 block B.
5. **`query_orders` rewritten** — kept for drill-down but relabelled
   "INSPECTION ONLY", given real filters plus `offset`, and made to print
   `MATCHED: <n>` and "do NOT hand-total a partial page". The point was to stop
   it *looking* like a complete answer, which is what fooled s3 and s6.

Smoke-tested all nine call shapes with `test_tool` against known ground truth
before dispatching; every figure matched.

## Round 2 — 7 / 7 passed

Worker cost $0.211 (4× cheaper than the failing round). Most workers finished in
5 turns with a single data call: s2, s3, s4, s5 each needed exactly one. s6 took
two, s7 took eleven (it queries each region separately for block A).

Two harmless inefficiencies, not worth another round: the s1 worker also ran the
other steps' queries and tried to update steps it did not own (correctly
rejected), and s7's per-region looping could be collapsed by a two-dimension
group_by. Neither affected correctness, and the rule is to re-dispatch only
unverified steps — there were none. Loop stopped at round 2 of 4.

## Final tool set

| Tool | Signature | Purpose |
|---|---|---|
| `summarize_orders` | `(region?, category?, product?, customer_id?, status?, month?, quarter?, date_from?, date_to?)` | Headline totals for the whole file or any slice: order counts by status, gross/net revenue, AOV, units, refunded revenue and rate. |
| `breakdown_orders` | `(group_by, sort?, limit?, region?, category?, product?, customer_id?, month?, quarter?, date_from?, date_to?)` | Main aggregator: ranked per-group net revenue, orders, units, AOV, share, MoM/QoQ change, plus highest/lowest/top-N footers. |
| `refund_report` | `(group_by, sort?, limit?, region?, category?, product?, date_from?, date_to?)` | Refund counts, refund rate (refunded / all-status orders) and refunded revenue per group, ranked, with overall footers. |
| `query_orders` | `(region?, category?, product?, customer_id?, status?, month?, date_from?, date_to?, offset?, limit?)` | Inspection only: paginated raw rows that report the full match count and warn against hand-totalling. |
| `_shared.mjs` | — | Not a tool (underscore-ignored): shared loader, filters, `statsFor()` metrics and no-pad 2-dp `fmt()`. |
