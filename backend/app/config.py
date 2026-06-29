import os
from dotenv import load_dotenv

# Load environment variables from .env file (override=True ensures fresh values on reload)
load_dotenv(override=True)

# OpenRouter API settings
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

# READING tasks: long-context document reading, article-to-thesis extraction,
# headline selection. owl-alpha excels at these high-context extraction jobs.
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openrouter/owl-alpha")
ARTICLE_DIGESTION_MODEL = os.getenv("ARTICLE_DIGESTION_MODEL", "openrouter/owl-alpha")

# REASONING tasks: view parsing (CoT), PM memo, variance calibration,
# AI portfolio commentary, thesis consolidation.
# Nemotron 3 Super 120B (MoE, 12B active) — NVIDIA's June 2026 reasoning model,
# free on OpenRouter, streams reasoning tokens for chain-of-thought. Smaller/faster than Ultra.
REASONING_MODEL = os.getenv("REASONING_MODEL", "nvidia/nemotron-3-super-120b-a12b:free")
VIEW_PARSING_MODEL = os.getenv("VIEW_PARSING_MODEL", "nvidia/nemotron-3-super-120b-a12b:free")

# Marketaux news API settings (market intelligence news source)
MARKETAUX_API_KEY = os.getenv("MARKETAUX_API_KEY", "")
MARKETAUX_API_URL = "https://api.marketaux.com/v1/news/all"
# Free tier caps the response at 3 articles per request
MARKETAUX_LIMIT = int(os.getenv("MARKETAUX_LIMIT", "3"))
# Comma-separated industries to pull news for (Marketaux taxonomy)
MARKETAUX_INDUSTRIES = os.getenv("MARKETAUX_INDUSTRIES", "Financial Services,Technology")

# FRED (Federal Reserve Economic Data) — free API key from https://fred.stlouisfed.org/docs/api/api_key.html
# Used to pull hard US macro series (CPI, rates, unemployment, etc.).
FRED_API_KEY = os.getenv("FRED_API_KEY", "")
FRED_API_URL = "https://api.stlouisfed.org/fred/series/observations"

# GDELT DOC 2.0 — global news/geopolitics/policy event feed (no API key required).
GDELT_API_URL = "https://api.gdeltproject.org/api/v2/doc/doc"

# The five asset-class sleeves used across the platform.
ASSET_CLASSES = ["KR_STOCK", "GLOBAL_STOCK", "KR_BOND", "GLOBAL_BOND", "ALTERNATIVE"]

# Database path
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./nps_platform.db")

# Black-Litterman and Optimization Defaults
DEFAULT_RISK_FREE_RATE = float(os.getenv("DEFAULT_RISK_FREE_RATE", "0.035"))
DEFAULT_RISK_AVERSION = float(os.getenv("DEFAULT_RISK_AVERSION", "2.5"))
DEFAULT_TAU = float(os.getenv("DEFAULT_TAU", "0.05"))

# Mapping assets to Yahoo Finance tickers
# Note: "KBOND" mapped to "136340.KS" (KBSTAR K-Bond Active) on Yahoo Finance
ETF_TICKER_MAPPING = {
    "KR_STOCK": "EWY",
    "GLOBAL_STOCK": "VT",
    "KR_BOND": "136340.KS",
    "GLOBAL_BOND": "BNDX",
    "ALTERNATIVE": "VNQ"
}

# ECOS (Bank of Korea) — free API key from https://ecos.bok.or.kr/
# Used to pull Korean macro series (BOK base rate, Korean CPI, trade balance, etc.).
ECOS_API_KEY = os.getenv("ECOS_API_KEY", "")
ECOS_API_URL = "https://ecos.bok.or.kr/api/StatisticSearch"

# CFTC Commitments of Traders — no key required (public weekly CSV)
CFTC_COT_URL = "https://www.cftc.gov/dea/newcot/FinFutWk.txt"

# ETF tickers to monitor for fund flow / shares-outstanding positioning signals
ETF_FLOW_TICKERS = ["SPY", "QQQ", "TLT", "GLD", "EEM", "EWY", "VNQ", "HYG", "LQD"]

# Central bank publication URLs (no API keys required)
FED_BEIGE_BOOK_URL = "https://www.federalreserve.gov/monetarypolicy/beigebook/"
BOK_MPB_URL = "https://www.bok.or.kr/eng/bbs/B0000160/list.do"
ECB_RSS_URL = "https://www.ecb.europa.eu/rss/press.html"
IMF_WEO_URL = "https://www.imf.org/en/Publications/WEO"
BIS_QR_URL = "https://www.bis.org/publ/qtrpdf/r_qt.htm"

# Set to "false" to disable best-effort commercial bank web scraping
BANK_RESEARCH_ENABLED = os.getenv("BANK_RESEARCH_ENABLED", "true").lower() == "true"

# NewsAPI — optional, free tier: 100 req/day, articles delayed 24h on free plan
# Get a key at https://newsapi.org/
NEWSAPI_KEY = os.getenv("NEWSAPI_KEY", "")

# Alpha Vantage — optional, free tier: 25 req/day, includes sentiment scores
# Get a key at https://www.alphavantage.co/support/#api-key
ALPHAVANTAGE_API_KEY = os.getenv("ALPHAVANTAGE_API_KEY", "")

# NPS Default target portfolio weights (2026 target allocation)
NPS_DEFAULT_TARGET_WEIGHTS = {
    "KR_STOCK": 0.208,
    "GLOBAL_STOCK": 0.347,
    "KR_BOND": 0.231,
    "GLOBAL_BOND": 0.074,
    "ALTERNATIVE": 0.140
}
