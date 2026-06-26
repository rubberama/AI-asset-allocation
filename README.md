# NPS AI Black-Litterman Asset Allocation Platform

An AI-native portfolio optimization engine modeled after the Korea National Pension Service (NPS) investment framework. It continuously ingests macro data, news, and institutional research — then uses LLM reasoning to extract quantitative investment views and run a Black-Litterman ensemble optimizer to produce balanced, explainable asset allocations.

Built for anyone who wants a research-grade, AI-augmented portfolio engine they can actually run locally.

---

## What It Does

Traditional portfolio optimizers are blind to current market conditions — they optimize on historical correlations alone. This platform closes that loop:

1. **Pulls live intelligence** from 10+ data sources: financial news, central bank publications, GDELT geopolitical events, CFTC positioning, ETF fund flows, FRED macro series, and Bank of Korea data
2. **Digests each source** through an LLM that extracts structured investment theses — bullish/bearish signals per asset class with supporting reasoning
3. **Converts theses into views** using a chain-of-thought reasoning model that outputs Black-Litterman-compatible parameters: which asset, expected return, and confidence level
4. **Runs the BL model** with He-Litterman tau calibration, Idzorek confidence weighting, and James-Stein shrinkage to prevent extreme posterior tilts
5. **Optimizes the portfolio** using an ensemble of Mean-Variance Optimization (60%), Risk Parity (20%), and Hierarchical Risk Parity (20%) — all constrained to stay within NPS benchmark deviation bands
6. **Outputs a full report**: final weights vs benchmark, expected return/risk metrics, efficient frontier, Monte Carlo paths, and an AI-written investment commentary

---

## Asset Classes

The platform allocates across five NPS-standard sleeves:

| Sleeve | Benchmark Ticker | NPS 2026 Target |
|--------|-----------------|----------------|
| Korean Stocks | EWY | 20.8% |
| Global Stocks | VT | 34.7% |
| Korean Bonds | 136340.KS | 23.1% |
| Global Bonds | BNDX | 7.4% |
| Alternatives | VNQ | 14.0% |

---

## Prerequisites

- Python 3.11+
- Node.js 18+
- An [OpenRouter](https://openrouter.ai) account — **free tier works**, all default models are free

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/rubberama/AI-asset-allocation.git
cd AI-asset-allocation
```

### 2. Set up the backend

```bash
cd backend
python -m venv .venv

# macOS / Linux
source .venv/bin/activate

# Windows
.venv\Scripts\activate

pip install -r requirements.txt
```

### 3. Configure your API keys

```bash
cp .env.example .env
```

Open `.env` and fill in your keys:

```env
# ── Required ──────────────────────────────────────────────────────────────────
OPENROUTER_API_KEY=sk-or-...        # https://openrouter.ai — free account

# ── Optional (platform works without these, just skips that data source) ──────
MARKETAUX_API_KEY=                  # https://www.marketaux.com — free tier
FRED_API_KEY=                       # https://fred.stlouisfed.org/docs/api/api_key.html — free
ECOS_API_KEY=                       # https://ecos.bok.or.kr — free (Korean macro)
```

Everything else in `.env.example` (models, risk parameters, database path) has sensible defaults and does not need to change.

### 4. Start the backend

```bash
cd backend
uvicorn app.main:app --reload
```

The API is now running at `http://localhost:8000`. You can explore the auto-generated docs at `http://localhost:8000/docs`.

### 5. Start the frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Confirm the **API Base URL** field in the top bar shows `http://localhost:8000`, then click **Run Simulation**.

---

## API Keys

| Key | Required | Purpose | Free tier |
|-----|----------|---------|-----------|
| `OPENROUTER_API_KEY` | **Yes** | All LLM calls (view extraction, commentary, thesis generation) | Yes |
| `MARKETAUX_API_KEY` | No | Financial news feed — selects and digests 10–15 articles from 30+ headlines | 3 articles/request |
| `FRED_API_KEY` | No | US macro series: CPI, fed funds rate, unemployment, yield curve | Unlimited |
| `ECOS_API_KEY` | No | Korean macro series: BOK base rate, Korean CPI, trade balance | Unlimited |

Without optional keys the platform degrades gracefully — it skips those sources and proceeds with whatever data it does have. You can run a full simulation with just an OpenRouter key using only yfinance price data.

---

## AI Models

All defaults are **free on OpenRouter**. No paid model required to get started.

| Role | Default | Override via |
|------|---------|-------------|
| Article digestion (long context) | `openrouter/owl-alpha` | `ARTICLE_DIGESTION_MODEL` |
| View parsing / PM memo | `deepseek/deepseek-chat-v3-0324:free` | `VIEW_PARSING_MODEL` |
| Chain-of-thought reasoning | `deepseek/deepseek-r1:free` | `REASONING_MODEL` |

To use a stronger model (e.g. Claude or GPT-4o) for better view quality, set the override in `.env`:

```env
REASONING_MODEL=anthropic/claude-sonnet-4-5
VIEW_PARSING_MODEL=anthropic/claude-haiku-4-5
```

---

## How It Works (Technical)

### Black-Litterman Model

The platform implements the He-Litterman (1999) formulation:

- **Prior**: market equilibrium returns `Π = λΣw`, where `λ` is dynamically estimated from the implied Sharpe ratio and `τ = 0.05` per the standard calibration
- **Views**: LLM-extracted absolute and relative return views `(P, Q)` with per-view confidence scores
- **Uncertainty**: Idzorek (2007) confidence calibration — maps analyst confidence `[0, 1]` to the Ω diagonal by solving for the posterior weight tilt that matches the stated confidence fraction of the full-confidence tilt
- **Shrinkage**: 20% James-Stein pull of each view toward the prior equilibrium, plus an 8% final blend back to `Π`, to prevent multi-view compounding in tail scenarios
- **Confidence cap**: hard ceiling at 0.72 to prevent any single view from dominating the posterior

### Ensemble Optimizer

Three optimizers run in parallel on the BL posterior returns, then blend:

| Optimizer | Weight | Role |
|-----------|--------|------|
| Mean-Variance (MVO) | 60% | Signal-carrying; responds to BL return tilts |
| Risk Parity (RP) | 20% | Equal risk contribution; stabilizes vs vol changes |
| Hierarchical Risk Parity (HRP) | 20% | Clustering-based; robust to correlation instability |

All three are constrained to `[benchmark ± max_deviation]` per asset class before blending.

### Data Pipeline

```
News / PDFs / RSS
       ↓
  Article Digestion (LLM)
       ↓
  Investment Theses (structured JSON)
       ↓
  View Extraction (CoT reasoning model)
       ↓
  BL Views: (asset, return, confidence)
       ↓
  Black-Litterman Posterior
       ↓
  Ensemble Optimizer
       ↓
  Final Weights + Risk Report
```

---

## Project Structure

```
backend/
  app/
    main.py                # FastAPI endpoints (/simulate, /allocate, /market-intelligence, ...)
    black_litterman.py     # BL posterior: Pi, Omega, Idzorek, James-Stein
    optimizer.py           # MVO / Risk Parity / HRP ensemble with constraint projection
    llm.py                 # OpenRouter calls + view parsing + clamping
    thesis_engine.py       # Converts raw intelligence into structured investment theses
    market_intelligence.py # Orchestrates all data sources
    collect.py             # Article selection and digestion pipeline
    research.py            # PDF ingestion and analysis
    config.py              # All env vars and constants
    sources/
      normalize.py         # Source-agnostic article normalizer
      news_feeds.py        # RSS + Marketaux
      central_banks.py     # Fed Beige Book, BOK MPB, ECB, IMF, BIS
      bank_research.py     # Commercial bank research scraping
      cftc.py              # CFTC Commitments of Traders
      etf_flows.py         # ETF shares outstanding / fund flow proxy
      ecos.py              # Bank of Korea ECOS API
  requirements.txt
  .env.example

frontend/
  app/
    page.tsx               # Full UI: simulation controls, charts, market intelligence tab
    globals.css
    layout.tsx
```

---

## License

MIT
