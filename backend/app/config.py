import os
import logging
from dotenv import load_dotenv

# Load environment variables from .env file (override=True ensures fresh values on reload)
load_dotenv(override=True)

logger = logging.getLogger(__name__)

# OpenRouter API settings
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

# READING tasks: long-context document reading, article-to-thesis extraction,
# headline selection. owl-alpha excels at these high-context extraction jobs.
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openrouter/owl-alpha")
ARTICLE_DIGESTION_MODEL = os.getenv("ARTICLE_DIGESTION_MODEL", "openrouter/owl-alpha")

# REASONING tasks: view parsing (CoT), PM memo, variance calibration,
# AI portfolio commentary, thesis consolidation.
# TEMPORARY (credit outage): pointed at owl-alpha so the desk keeps running without
# OpenRouter credit. The reasoning-grade default was the Nemotron 3 Super 120B MoE
# model ("nvidia/nemotron-3-super-120b-a12b:free"); switch back from the 설정 tab or
# by editing .env once credit is restored.
REASONING_MODEL = os.getenv("REASONING_MODEL", "openrouter/owl-alpha")
VIEW_PARSING_MODEL = os.getenv("VIEW_PARSING_MODEL", "openrouter/owl-alpha")

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

# ─────────────────────────────────────────────────────────────────────────────
# Model task registry — single source of truth for the 설정 (Config) tab.
#
# Each "task" maps a human-facing job to one of the model env vars defined above.
# The /config/models API reads the *live* module attribute (so a switch takes
# effect immediately) and set_model() persists the choice back to .env so it
# survives a restart. Call sites must read these via config.<NAME> (not a copied
# `from app.config import NAME`) for live switching to work.
# ─────────────────────────────────────────────────────────────────────────────

# Curated models the UI offers per task. `kind` hints whether the model can do
# multi-step reasoning (CoT) or is a fast/cheap extractor with no reasoning.
MODEL_CHOICES = [
    {"id": "openrouter/owl-alpha",                       "label": "Owl Alpha",          "kind": "fast",      "note": "빠른 무료 모델 · 추론(CoT) 없음"},
    {"id": "nvidia/nemotron-3-super-120b-a12b:free",     "label": "Nemotron 3 Super",   "kind": "reasoning", "note": "추론 모델 (무료) · 120B MoE"},
    {"id": "nvidia/nemotron-3-ultra-550b-a55b:free",     "label": "Nemotron 3 Ultra",   "kind": "reasoning", "note": "프론티어 추론 (무료) · 550B MoE"},
    {"id": "deepseek/deepseek-r1:free",                  "label": "DeepSeek R1",        "kind": "reasoning", "note": "추론 모델 (무료)"},
    {"id": "deepseek/deepseek-chat-v3-0324:free",        "label": "DeepSeek Chat v3",   "kind": "fast",      "note": "빠른 모델 (무료)"},
    {"id": "anthropic/claude-haiku-4-5",                 "label": "Claude Haiku 4.5",   "kind": "fast",      "note": "유료 · 빠름"},
    {"id": "anthropic/claude-sonnet-4-5",                "label": "Claude Sonnet 4.5", "kind": "reasoning", "note": "유료 · 고품질 추론"},
]

# The jobs shown in the settings tab, in workflow order. `env` is both the env-var
# name and this module's attribute name; `prefer` flags which `kind` suits the job.
MODEL_TASKS = [
    {"key": "reading",      "env": "OPENROUTER_MODEL",        "label": "일반 읽기 / 헤드라인 선택", "desc": "장문 컨텍스트 읽기 · 헤드라인 추출",            "prefer": "fast"},
    {"key": "article",      "env": "ARTICLE_DIGESTION_MODEL", "label": "기사 분석 (장문)",          "desc": "기사 → 투자 논거 추출",                       "prefer": "fast"},
    {"key": "view_parsing", "env": "VIEW_PARSING_MODEL",      "label": "의견 파싱 / 변동성 보정",     "desc": "사용자 의견(CoT) 파싱 · 3× 샘플 신뢰도 보정",   "prefer": "reasoning"},
    {"key": "reasoning",    "env": "REASONING_MODEL",         "label": "연쇄 추론 / PM 메모",        "desc": "CoT 추론 · PM 메모 · 논거 통합 · AI 코멘터리",  "prefer": "reasoning"},
]

_VALID_TASK_ENVS = {t["env"] for t in MODEL_TASKS}

# Absolute path to the .env file (backend/.env — one level up from this app/ dir).
ENV_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")


def get_model(env_key: str) -> str:
    """Return the model currently in use for a task (live module attribute)."""
    return globals().get(env_key, "")


def set_model(env_key: str, value: str) -> None:
    """Switch the model for a task: update the live in-memory value AND persist
    it to .env so the choice survives a restart. Raises ValueError for an
    unknown task key."""
    if env_key not in _VALID_TASK_ENVS:
        raise ValueError(f"Unknown model task: {env_key}")
    globals()[env_key] = value          # live — call sites read config.<NAME>
    os.environ[env_key] = value         # keep the process env in sync
    _persist_env_var(env_key, value)    # durable — rewrite the .env line


def _persist_env_var(key: str, value: str) -> None:
    """Rewrite a single KEY=value line in .env, preserving every other line.
    Appends the line if the key is absent. Best-effort: logs a warning on IO
    error rather than failing the request."""
    new_line = f"{key}={value}\n"
    try:
        lines = []
        if os.path.exists(ENV_PATH):
            with open(ENV_PATH, "r", encoding="utf-8") as f:
                lines = f.readlines()
        replaced = False
        for i, ln in enumerate(lines):
            stripped = ln.lstrip()
            if stripped.startswith(f"{key}=") and not stripped.startswith("#"):
                lines[i] = new_line
                replaced = True
                break
        if not replaced:
            if lines and not lines[-1].endswith("\n"):
                lines[-1] += "\n"
            lines.append(new_line)
        with open(ENV_PATH, "w", encoding="utf-8") as f:
            f.writelines(lines)
    except OSError as e:
        logger.warning(f"Could not persist {key} to {ENV_PATH}: {e}")
