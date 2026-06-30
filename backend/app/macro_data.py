import logging
import yfinance as yf
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

TICKER_DETAILS = {
    "VIX": {"ticker": "^VIX", "name": "CBOE VIX Volatility", "category": "VOLATILITY"},
    "MOVE": {"ticker": "^MOVE", "name": "MOVE Bond Volatility", "category": "VOLATILITY"},
    
    "US3M": {"ticker": "^IRX", "name": "US 3-Month T-Bill Yield", "category": "YIELD_CURVE"},
    "US5Y": {"ticker": "^FVX", "name": "US 5-Year Treasury Yield", "category": "YIELD_CURVE"},
    "US10Y": {"ticker": "^TNX", "name": "US 10-Year Treasury Yield", "category": "YIELD_CURVE"},
    "US30Y": {"ticker": "^TYX", "name": "US 30-Year Treasury Yield", "category": "YIELD_CURVE"},
    
    "HYG": {"ticker": "HYG", "name": "iShares High Yield Corporate Bond", "category": "CREDIT_FIXED_INCOME"},
    "LQD": {"ticker": "LQD", "name": "iShares Investment Grade Corporate Bond", "category": "CREDIT_FIXED_INCOME"},
    "TLT": {"ticker": "TLT", "name": "iShares 20+ Year Treasury Bond", "category": "CREDIT_FIXED_INCOME"},
    "IEF": {"ticker": "IEF", "name": "iShares 7-10 Year Treasury Bond", "category": "CREDIT_FIXED_INCOME"},
    
    "SPY": {"ticker": "SPY", "name": "S&P 500 ETF (SPY)", "category": "EQUITY"},
    "QQQ": {"ticker": "QQQ", "name": "Nasdaq 100 ETF (QQQ)", "category": "EQUITY"},
    "EFA": {"ticker": "EFA", "name": "iShares MSCI EAFE ETF (EFA)", "category": "EQUITY"},
    "EEM": {"ticker": "EEM", "name": "iShares MSCI Emerging Markets ETF (EEM)", "category": "EQUITY"},
    "KOSPI": {"ticker": "^KS11", "name": "KOSPI Composite Index", "category": "EQUITY"},
    
    "GOLD": {"ticker": "GC=F", "name": "Gold Spot Price", "category": "ALTERNATIVES_COMMODITIES"},
    "WTI": {"ticker": "CL=F", "name": "Crude Oil (WTI)", "category": "ALTERNATIVES_COMMODITIES"},
    "BTC": {"ticker": "BTC-USD", "name": "Bitcoin (USD)", "category": "ALTERNATIVES_COMMODITIES"},
    "VNQ": {"ticker": "VNQ", "name": "Vanguard Real Estate ETF (VNQ)", "category": "ALTERNATIVES_COMMODITIES"},
    
    "USD_KRW": {"ticker": "KRW=X", "name": "USD/KRW Exchange Rate", "category": "FOREX"},
    "DXY": {"ticker": "DX-Y.NYB", "name": "US Dollar Index (DXY)", "category": "FOREX"}
}

def fetch_macro_context() -> dict:
    """
    Fetches 20+ key macro market indicators with 3 months of history for sparklines.
    """
    indicators = {}
    
    # Download in batch is faster but one-by-one is more resilient
    for key, t_info in TICKER_DETAILS.items():
        try:
            ticker_obj = yf.Ticker(t_info["ticker"])
            history_df = ticker_obj.history(period="1y")
            if not history_df.empty:
                closes = history_df["Close"].dropna().tolist()
                dates = history_df.index.strftime("%Y-%m-%d").tolist()
                
                if len(closes) > 0:
                    current_val = round(closes[-1], 2)
                    prev_val = closes[0]
                    change_pct = round(((current_val / prev_val) - 1) * 100, 2) if prev_val != 0 else 0.0
                    
                    if len(closes) >= 2:
                        prev_val_1d = closes[-2]
                        change_1d = round(((current_val / prev_val_1d) - 1) * 100, 2) if prev_val_1d != 0 else 0.0
                    else:
                        change_1d = 0.0
                    
                    history_points = [{"date": d, "value": round(val, 2)} for d, val in zip(dates, closes)]
                    
                    indicators[key] = {
                        "name": t_info["name"],
                        "ticker": t_info["ticker"],
                        "current": current_val,
                        "change_5d": change_pct,
                        "change_1d": change_1d,
                        "history": history_points,
                        "category": t_info["category"]
                    }
        except Exception as e:
            logger.warning(f"Failed to fetch macro indicator {key} ({t_info['ticker']}): {e}")

    # Calculate US 10Y - 3M Spread if both exist
    if "US10Y" in indicators and "US3M" in indicators:
        try:
            us10y = indicators["US10Y"]["current"]
            us3m = indicators["US3M"]["current"]
            spread = round(us10y - us3m, 2)
            
            hist10y = indicators["US10Y"]["history"]
            hist3m = indicators["US3M"]["history"]
            history_spread = []
            for h1, h2 in zip(hist10y, hist3m):
                history_spread.append({
                    "date": h1["date"],
                    "value": round(h1["value"] - h2["value"], 2)
                })
            
            change_5d = round(history_spread[-1]["value"] - history_spread[0]["value"], 2)
            change_1d = round(history_spread[-1]["value"] - history_spread[-2]["value"], 2) if len(history_spread) >= 2 else 0.0
            
            indicators["YIELD_SPREAD"] = {
                "name": "US 10Y - 3M Sovereign Yield Spread",
                "ticker": "SPREAD",
                "current": spread,
                "change_5d": change_5d,
                "change_1d": change_1d,
                "history": history_spread,
                "category": "YIELD_CURVE"
            }
        except Exception as e:
            logger.warning(f"Failed to calculate yield spread: {e}")

    # Regime detection heuristic based on VIX
    vix_val = indicators.get("VIX", {}).get("current", 20)
    if vix_val > 30:
        indicators["market_regime"] = "CRISIS"
        indicators["regime_kr"] = "위기 / 고변동성 국면"
    elif vix_val > 20:
        indicators["market_regime"] = "ELEVATED_RISK"
        indicators["regime_kr"] = "경계 / 리스크 상승 국면"
    elif vix_val < 13:
        indicators["market_regime"] = "LOW_VOL"
        indicators["regime_kr"] = "저변동성 / 안정 국면"
    else:
        indicators["market_regime"] = "NORMAL"
        indicators["regime_kr"] = "정상 시장 국면"
        
    try:
        indicators["correlation_matrix"] = compute_correlation_matrix(indicators)
    except Exception as e:
        logger.warning(f"Failed to compute correlation matrix: {e}")
        indicators["correlation_matrix"] = {}

    logger.info(f"Fetched {len(indicators) - 3} macro indicators. Regime: {indicators.get('market_regime', 'UNKNOWN')}")
    return indicators

def compute_correlation_matrix(indicators: dict) -> dict:
    """
    Computes Pearson correlation matrix for key macro indicators over 1 year.
    """
    import pandas as pd
    
    target_keys = ["SPY", "QQQ", "KOSPI", "VIX", "US10Y", "YIELD_SPREAD", "HYG", "GOLD", "BTC", "USD_KRW"]
    
    series_dict = {}
    for key in target_keys:
        if key in indicators and isinstance(indicators[key], dict) and "history" in indicators[key]:
            hist = indicators[key]["history"]
            if hist:
                dates = [pt["date"] for pt in hist]
                values = [pt["value"] for pt in hist]
                series_dict[key] = pd.Series(values, index=pd.to_datetime(dates))
            
    if not series_dict:
        return {}
        
    df = pd.DataFrame(series_dict)
    # Align and forward-fill/backward-fill missing values
    df = df.ffill().bfill()
    
    # Compute correlation matrix
    corr_df = df.corr()
    
    # Replace NaN with 0.0 for safety
    corr_df = corr_df.fillna(0.0)
    
    # Convert to standard python dict
    return corr_df.to_dict()

def format_macro_context_for_llm(indicators: dict) -> str:
    """
    Formats the macro indicators into a human-readable string for the LLM system prompt.
    """
    lines = ["=== CURRENT MARKET DATA (REAL-TIME) ==="]
    
    for key, data in indicators.items():
        if isinstance(data, dict) and "current" in data:
            lines.append(f"- {data['name']} ({key}): {data['current']} (YoY Change: {data.get('change_5d', 0)}%, 1D Change: {data.get('change_1d', 0)}%)")
            
    if "market_regime" in indicators:
        lines.append(f"- Detected Market Regime: {indicators['market_regime']}")
        lines.append(f"- Regime (KR): {indicators.get('regime_kr')}")
        
    lines.append("=== END MARKET DATA ===")
    return "\n".join(lines)

