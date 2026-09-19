# Bench: 5 runs, fixed plan, seed tool, main model opus

| Run | Rounds | Final verified | Converged | Round-1 pass | Main turns | Main cost | Worker cost | Total cost | Minutes | Final tools |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2 | 7/7 | yes | 0/7 | 28 | $1.37 | $1.10 | $2.47 | 7.8 | breakdown_orders, query_orders, refund_report, summarize_orders |
| 2 | 2 | 7/7 | yes | 0/7 | 25 | $1.17 | $0.81 | $1.98 | 7.0 | sales_breakdown, sales_summary |
| 3 | 2 | 7/7 | yes | 0/7 | 31 | $1.14 | $1.53 | $2.67 | 9.8 | breakdown, query_orders, refund_report, sales_summary |
| 4 | 2 | 7/7 | yes | 0/7 | 27 | $1.32 | $1.17 | $2.50 | 7.4 | sales_breakdown, sales_summary |
| 5 | 2 | 7/7 | yes | 0/7 | 29 | $1.05 | $1.42 | $2.47 | 10.5 | breakdown, cross_breakdown, sales_overview |

- Converged: 5/5
- Rounds to finish: mean 2.0, min 2, max 2
- Total cost per run (API-rate estimate): mean $2.42, min $1.98, max $2.67
- Minutes per run: mean 8.5
- Final tool count: 4, 2, 4, 2, 3

Per-round pass counts:
- run 1: 0/7 -> 7/7
- run 2: 0/7 -> 7/7
- run 3: 0/7 -> 7/7
- run 4: 0/7 -> 7/7
- run 5: 0/7 -> 7/7
