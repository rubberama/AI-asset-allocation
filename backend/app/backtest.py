"""Backtesting / Information-Coefficient harness — Stage 4.

The point of this module is to answer the only question that turns the engine from a
demo into a tool: *do our theses have predictive value?* For theses whose horizon has
already elapsed, we compare the predicted direction/magnitude against the realized
forward return of the corresponding ETF and report hit-rate + Information Coefficient.
"""
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import numpy as np

from app.config import ETF_TICKER_MAPPING

logger = logging.getLogger(__name__)

HORIZON_DAYS = {"1M": 21, "3M": 63, "6M": 126, "12M": 252}


def compute_ic(predicted: List[float], realized: List[float]) -> Optional[float]:
    """Information Coefficient = Pearson correlation between predicted signal and
    realized return across views. None if too few points."""
    if len(predicted) < 2:
        return None
    p, r = np.array(predicted, dtype=float), np.array(realized, dtype=float)
    if np.std(p) < 1e-9 or np.std(r) < 1e-9:
        return 0.0
    return float(np.corrcoef(p, r)[0, 1])


def hit_rate(predicted: List[float], realized: List[float]) -> Optional[float]:
    """Fraction of views whose predicted direction matched the realized direction."""
    if not predicted:
        return None
    hits = sum(1 for p, a in zip(predicted, realized) if (p > 0) == (a > 0))
    return round(hits / len(predicted), 3)


def realized_forward_return(ticker: str, as_of: datetime, horizon_days: int) -> Optional[float]:
    """Realized return of `ticker` from `as_of` to `as_of + horizon_days` (decimal)."""
    import yfinance as yf
    start = (as_of - timedelta(days=7)).strftime("%Y-%m-%d")
    end = (as_of + timedelta(days=horizon_days + 7)).strftime("%Y-%m-%d")
    try:
        df = yf.download(ticker, start=start, end=end, progress=False)
        if df.empty:
            return None
        close = df["Close"]
        if hasattr(close, "columns"):
            close = close.iloc[:, 0]
        close = close.dropna()
        if len(close) < 2:
            return None
        # nearest price at/after as_of, and at/after as_of+horizon
        idx = close.index
        start_px = close[idx >= as_of.strftime("%Y-%m-%d")]
        target_date = as_of + timedelta(days=horizon_days)
        end_px = close[idx >= target_date.strftime("%Y-%m-%d")]
        if len(start_px) == 0 or len(end_px) == 0:
            return None
        return float(end_px.iloc[0] / start_px.iloc[0] - 1.0)
    except Exception as e:
        logger.warning(f"realized_forward_return failed for {ticker}: {e}")
        return None


def _predicted_signal(thesis: Dict[str, Any]) -> Optional[tuple]:
    """Returns (asset, signed_predicted_return) for an absolute thesis, else None."""
    mag = thesis.get("magnitude")
    if thesis.get("view_type") == "absolute" and thesis.get("asset") and mag is not None:
        signed = -abs(float(mag)) if thesis.get("direction") == "bearish" else abs(float(mag))
        return thesis["asset"], signed
    return None


def run_thesis_backtest(theses: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Evaluates theses whose horizon window has fully elapsed against realized ETF returns."""
    predicted, realized, details, skipped = [], [], [], 0
    now = datetime.utcnow()

    for t in theses:
        sig = _predicted_signal(t)
        if not sig:
            skipped += 1
            continue
        asset, pred = sig
        ticker = ETF_TICKER_MAPPING.get(asset)
        horizon_days = HORIZON_DAYS.get(t.get("horizon", "12M"), 252)
        try:
            as_of = datetime.fromisoformat((t.get("created_at") or now.isoformat()).split("T")[0])
        except Exception:
            as_of = now
        # only evaluate if the full horizon has elapsed
        if (now - as_of).days < horizon_days:
            skipped += 1
            continue
        actual = realized_forward_return(ticker, as_of, horizon_days)
        if actual is None:
            skipped += 1
            continue
        predicted.append(pred)
        realized.append(actual)
        details.append({
            "thesis_id": t.get("id"), "asset": asset, "predicted": round(pred, 4),
            "realized": round(actual, 4), "correct": (pred > 0) == (actual > 0),
        })

    result = {
        "n_evaluated": len(predicted),
        "n_skipped": skipped,
        "information_coefficient": compute_ic(predicted, realized),
        "hit_rate": hit_rate(predicted, realized),
        "details": details,
    }
    if not predicted:
        result["note"] = ("No theses have a fully-elapsed horizon yet, so realized returns "
                          "aren't available. The harness will score them once their horizon passes.")
    return result
