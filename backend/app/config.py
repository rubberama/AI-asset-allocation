import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# OpenRouter API settings
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openrouter/owl-alpha")
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

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

# NPS Default target portfolio weights (2026 target allocation)
NPS_DEFAULT_TARGET_WEIGHTS = {
    "KR_STOCK": 0.208,
    "GLOBAL_STOCK": 0.347,
    "KR_BOND": 0.231,
    "GLOBAL_BOND": 0.074,
    "ALTERNATIVE": 0.140
}
