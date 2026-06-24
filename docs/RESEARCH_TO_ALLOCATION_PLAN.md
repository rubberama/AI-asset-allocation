# From Information to Allocation — A Quant Build Plan
### Turning richer info-digestion into defensible asset-allocation decisions

> **Goal.** Evolve the platform from "one news call → LLM commentary → optimizer" into a
> real research-to-allocation engine: **(1) search & select information → (2) build calibrated
> theses → (3) compute allocations** — auditable, backtestable, and trustworthy enough to put
> capital behind.

The optimizer is **not** the bottleneck. We already have Black-Litterman + Markowitz/Risk
Parity/HRP + Monte-Carlo and historical stress tests. The edge — and the risk — lives in two
places the current system barely touches:

1. **Breadth & quality of the information funnel** (we ingest ~3 news articles).
2. **The bridge from qualitative theses → quantitative BL views** `(P, Q, Ω)` with *calibrated*
   confidence and *conflict resolution*. Today the LLM emits a confidence number that maps to
   `Ω` through an ad-hoc formula — that is the single weakest link in the chain.

---

## Stage 1 — Information Layer: Search & Select

**Problem with today:** a single Marketaux call (3 articles, finance/tech) is far too thin to
support a fiduciary thesis. We need *far more* information, and a disciplined way to filter it.

### 1.1 Expand the source universe (breadth)
Organize collectors by signal type, each normalized into a common `Document` schema:

| Class | Sources | Why it matters for our 5 assets |
|---|---|---|
| News / aggregators | Marketaux (paginate, raise limit), GDELT, NewsAPI, RSS bundles | Breadth, sentiment, event detection |
| **Primary filings** | SEC EDGAR (10-K/Q, 8-K), **DART (KR filings)** | Ground truth for KR_STOCK / GLOBAL_STOCK |
| Earnings transcripts | Calls + guidance | Forward-looking, less "already priced" |
| **Macro / econ** | FRED (US), **ECOS (Bank of Korea)**, IMF/OECD | Drives KR_BOND / GLOBAL_BOND / regime |
| Central-bank comms | FOMC minutes, BOK statements | Rate-path views (bond duration) |
| Positioning / flows | CFTC COT, ETF flows, put/call & VIX term structure | "Is this already priced in?" |
| Credit / FX / alts | HYG-LQD spread, USD/KRW, REIT (VNQ), commodities | ALTERNATIVE + FX-hedge decisions |

Several macro tickers already exist in `macro_data.py` — extend that pattern rather than rebuild.

### 1.2 Select, don't just collect (quality)
Raw volume is noise. Add a **research queue** that scores every document before it reaches the LLM:

- **Relevance** — embedding similarity to each of the 5 asset classes (route a doc to the assets it actually affects).
- **De-duplication** — cluster near-identical stories (embeddings + cosine threshold) so 20 reprints of one Reuters wire don't count as 20 signals.
- **Source credibility weight** — primary filing > tier-1 wire > aggregator > blog.
- **Recency decay** — exponential half-life; a 3-week-old "rate cut soon" is stale.
- **Novelty / surprise** — down-weight what the market has already absorbed (compare to recent price/positioning).

Output of Stage 1: a ranked, de-duplicated, asset-tagged **document feed** — not a raw dump.

### 1.3 Engineering
- New tables: `documents` (raw + normalized + score + embedding), plus a vector store (pgvector / FAISS / Chroma).
- Background collectors on a scheduler (APScheduler/Celery), not inline in the request path.
- Cache + rate-limit budgets per source (Marketaux free tier = 3/req, 100/day — paginate within budget).

---

## Stage 2 — Thesis Layer: Build & Calibrate

**Problem with today:** each article is digested in isolation into a thesis, and the LLM's
self-reported confidence is taken at face value. LLMs are systematically **overconfident**, and
isolated theses can flatly contradict each other.

### 2.1 Two-pass digestion (now powered by Nemotron Ultra)
- **Pass A — Atomic claims.** Per document, extract structured claims:
  `{asset(s), direction, magnitude, horizon, confidence, evidence_quote, source}`.
- **Pass B — Consolidation.** Cluster claims by theme/asset and synthesize a **house view** per
  asset (and per pair, for relative views). Resolve bull-vs-bear conflicts explicitly; the output
  is a *distribution / strength*, not a lone opinion.

### 2.2 Calibrate confidence properly (the key upgrade)
Replace face-value confidence with a calibrated score driven by:
- **Corroboration** — # of *independent* sources agreeing (independence matters; 5 reprints ≠ 5 sources).
- **Evidence strength** — primary filing/data > opinion.
- **Consistency** — agreement across an LLM ensemble / repeated samples.
- **Market-implied prior** — don't fight what's already priced; discount theses the market already reflects.

This calibrated confidence is what feeds `Ω` in Stage 3 — so getting it right is worth more than
any optimizer tweak.

### 2.3 Auditability
Every consolidated thesis links back to its source documents and evidence quotes. This is what
makes it a *tool* (a portfolio manager can defend it) rather than a black box.

---

## Stage 3 — Allocation Layer: Calculation

**Problem with today:** the view→`Ω` mapping is ad-hoc (`Ω = τ·pᵀΣp·(1-c)/c`), and we run a
single optimizer on a single set of point estimates — fragile to estimation error.

### 3.1 Rigorous thesis → BL view mapping
- **Q (view returns):** derive from `magnitude × horizon`, annualized and sanity-bounded.
- **Ω (uncertainty):** adopt the **Idzorek (2007)** method — set `Ω` directly from a confidence
  percentage, which is intuitive to calibrate and is the institutional standard. This is a clean,
  high-leverage replacement for the current heuristic.
- Keep absolute + relative views (already supported); add **view-on-view correlation** in `Ω`.

### 3.2 Robustness (estimation error is the silent killer)
- **Regime-conditional priors:** scale risk-aversion `λ` and shrink views by the VIX/credit regime
  (`macro_data.py` already classifies regimes) — lean out in crisis, lean in when calm.
- **Resampled efficient frontier (Michaud):** average optimal weights over many bootstrap draws to
  curb the optimizer's tendency to over-fit noisy inputs.
- **Optimizer ensemble:** we already compute MVO / Risk Parity / HRP — blend them (or show the
  dispersion) instead of trusting one.

### 3.3 Real-world constraints
- **Transaction-cost / turnover penalty** so the tool doesn't churn the book on every news cycle.
- **Liquidity caps** on the ALTERNATIVE sleeve; **FX-hedge** decision on global allocations for a
  KRW-funded liability.
- Benchmark-deviation bound already exists — keep it as the governance guardrail.

### 3.4 Output a decision package, not just weights
Weights **+** the theses that drove them **+** evidence links **+** risk metrics (MC + historical,
already built) **+** **attribution** (which view moved which weight, in %p). That package is the
deliverable an investment committee can actually use.

---

## What makes it a *usable tool* (not a demo)

1. **Backtesting & validation harness — the single most important addition.**
   Replay historical documents → theses → allocations → measure realized vs. expected.
   Track the **Information Coefficient (IC)** and **hit-rate** of the thesis engine. If the views
   have no predictive value, no optimizer can save them — and if they do, this is what earns trust.
2. **Human-in-the-loop.** Analyst reviews/edits theses and confidence before they hit the optimizer
   (extends the existing "apply to simulator" + comments flow into an approval gate).
3. **Monitoring & decay.** Theses age out; triggers force re-evaluation; alert on regime shifts.
4. **Governance & reproducibility.** Versioned snapshots (we already persist simulations), full
   audit trail from weight → view → evidence → source document.

---

## Phased roadmap

| Phase | Deliverable | Status |
|---|---|---|
| **0 — Foundation** | Nemotron-Ultra digestion + Marketaux + URL ingestion; single-doc → thesis | ✅ in place |
| **1 — Breadth & selection** | +FRED / EDGAR / **DART** / transcripts; `documents` table + embeddings; relevance scoring, dedup, ranked research queue | next |
| **2 — Thesis quality** | Two-pass digestion; consolidation + conflict resolution; **calibrated confidence**; provenance | |
| **3 — Allocation rigor** | **Idzorek `Ω`**; regime-conditional priors; resampled frontier; optimizer ensemble | |
| **4 — Make it a tool** | **Backtesting / IC harness**; analyst approval UI; turnover & liquidity constraints; monitoring/alerts | |

### Recommended next concrete step
Build **Phase 1's `documents` model + 2–3 high-value collectors (FRED, DART, one transcript
source) + the relevance/dedup scorer**. That widens the funnel immediately and creates the
substrate every later phase builds on — and it's the part the current architecture is closest to
being able to support.
