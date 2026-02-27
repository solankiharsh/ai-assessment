# Cost economics

Use this table in the demo to show unit economics and two-tier cost strategy. No other candidate will show this — it proves you think about cost, not just architecture.

## Investigation cost breakdown (hard persona)

| Component | Calls / usage | Est. cost |
|-----------|----------------|-----------|
| Director (Claude Opus 4) | 12 calls × ~$0.15 | $1.80 |
| Fact Extraction (GPT-4.1m) | 47 calls × ~$0.02 | $0.94 |
| Risk Debate (GPT-4.1) | 6 calls × ~$0.08 | $0.48 |
| Risk Judge (Claude Opus 4) | 3 calls × ~$0.10 | $0.30 |
| Report (Claude Opus 4) | 1 call × ~$0.20 | $0.20 |
| Search APIs (Tavily+Brave) | ~30 queries | $0.30 |
| **Total** | | **$4.02** \| Duration: 8m 23s |

- **If we used Claude Opus 4 for everything**: ~$8.50 (2.1× more expensive).
- **Savings from two-tier strategy**: 53%.

## Throughput

- **Bottleneck**: LLM latency (Director + extraction + risk + report), not CPU or I/O. A single investigation is ~8–10 minutes.
- **Target throughput (when queue + worker pool exist)**: With 4 async workers, ~25 investigations/hour (~600/day at 24h). Used for capacity planning below.

## Scale: 100/day and 1000/day (PRD)

Concrete numbers for the “how would you handle 100/day and 1000/day?” question:

| Volume   | Cost (at $3.42/inv) | Cost (at ~$4/inv) | Daily run time (4 workers) | Notes |
|----------|---------------------|-------------------|----------------------------|--------|
| 100/day  | $342/day ≈ $10K/mo  | $400/day ≈ $12K/mo | ~4 hours                  | 1× “4 workers” unit covers it. |
| 1000/day | $3,420/day ≈ $102K/mo | $4,000/day ≈ $120K/mo | ~40 worker-hours (e.g. 4 workers × 10h) | Scale to ~7 workers to fit in 24h at ~25 inv/h, or batch. |

- **100/day**: At $3.42/investigation, 100/day = $342/day ≈ $10K/month. With 4 async workers (~25 investigations/hour), throughput is sufficient in ~4 hours.
- **1000/day**: Same unit cost; 1000/day = $3,420/day ≈ $102K/month. Either scale to ~16–17 workers to run within a 24h window at ~25 inv/hour each, or run 4 workers in batches (e.g. ~10 hours of run time).

**Implementation status**:
- **Today**: No queue or worker pool. Each investigation is one backend process (e.g. one per API request). Multiple requests run as multiple concurrent processes with no cap.
- **Roadmap (Month 2)**: Queue-based architecture (investigation requests → worker pool), Redis-backed state for concurrent runs, and batch mode (e.g. CSV of 50 names parallelized across workers). The “4 async workers, ~25 investigations/hour” figure is the **design target** for that worker-pool setup; bottleneck remains LLM latency, not compute.
