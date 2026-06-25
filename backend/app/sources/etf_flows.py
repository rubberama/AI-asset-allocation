"""ETF flows collector — shares-outstanding snapshots as fund-flow positioning signals.

Uses yfinance (already installed) to fetch current shares outstanding for key ETFs.
On subsequent runs, collect.py delta-compares against prior stored values to compute
week-over-week change and emit a directional signal.
"""
import asyncio
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from app.config import ETF_FLOW_TICKERS
from app.sources.normalize import make_document, POSITIONING

logger = logging.getLogger(__name__)

# (ticker, sleeve_hint, asset_label)
_TICKER_MAP: Dict[str, Tuple[str, str]] = {
    "SPY":   ("GLOBAL_STOCK", "US Large Cap Equities"),
    "QQQ":   ("GLOBAL_STOCK", "US Tech / Nasdaq"),
    "TLT":   ("GLOBAL_BOND",  "Long-Duration US Treasuries"),
    "GLD":   ("ALTERNATIVE",  "Gold"),
    "EEM":   ("GLOBAL_STOCK", "Emerging Markets Equities"),
    "EWY":   ("KR_STOCK",     "Korean Equities"),
    "VNQ":   ("ALTERNATIVE",  "US REITs"),
    "HYG":   ("ALTERNATIVE",  "US High Yield Bonds"),
    "LQD":   ("GLOBAL_BOND",  "US Investment Grade Bonds"),
}


def _get_ticker_snapshot(ticker: str) -> Dict[str, Any]:
    """Synchronous yfinance call — run inside an executor."""
    import yfinance as yf
    t = yf.Ticker(ticker)
    shares: Optional[float] = None
    price: Optional[float] = None
    try:
        fi = t.fast_info
        shares = getattr(fi, "shares", None)
        price = getattr(fi, "last_price", None)
    except Exception:
        pass
    if shares is None:
        try:
            info = t.info
            shares = info.get("sharesOutstanding")
            if price is None:
                price = info.get("previousClose") or info.get("regularMarketPreviousClose")
        except Exception:
            pass
    return {"ticker": ticker, "shares": shares, "price": price}


async def fetch_etf_flows(prior_shares: Dict[str, float] = None) -> List[Dict[str, Any]]:
    """Fetches ETF shares-outstanding snapshots. Optionally computes week-over-week % change
    if prior_shares dict (ticker → shares) is provided by the caller."""
    loop = asyncio.get_event_loop()
    tickers = list(_TICKER_MAP.keys())

    tasks = [loop.run_in_executor(None, _get_ticker_snapshot, t) for t in tickers]
    try:
        snapshots = await asyncio.gather(*tasks, return_exceptions=True)
    except Exception as e:
        logger.warning(f"ETF flows gather failed: {e}")
        return []

    prior_shares = prior_shares or {}
    docs: List[Dict[str, Any]] = []
    now = datetime.utcnow().strftime("%Y-%m-%d")

    for snap in snapshots:
        if isinstance(snap, Exception) or not isinstance(snap, dict):
            continue
        ticker = snap.get("ticker", "")
        shares = snap.get("shares")
        price = snap.get("price")
        if not ticker or shares is None:
            continue

        sleeve, label = _TICKER_MAP.get(ticker, ("GLOBAL_STOCK", ticker))

        prior = prior_shares.get(ticker)
        wow_pct: Optional[float] = None
        direction: Optional[str] = None
        if prior and prior > 0:
            wow_pct = round((shares - prior) / prior * 100, 2)
            if wow_pct < -1.5:
                direction = "bearish"
            elif wow_pct > 1.5:
                direction = "bullish"

        shares_m = round(shares / 1e6, 1)
        title_parts = [f"ETF {ticker} ({label}) shares outstanding: {shares_m}M"]
        if wow_pct is not None:
            title_parts.append(f"WoW {wow_pct:+.1f}%")
            if direction:
                title_parts.append(f"— {direction} outflow/inflow signal")

        title = " | ".join(title_parts)
        text = (
            f"ETF fund flow snapshot for {ticker} ({label}) as of {now}. "
            f"Shares outstanding: {shares_m}M"
            + (f" (previous: {round(prior/1e6,1)}M, week-over-week: {wow_pct:+.1f}%)" if wow_pct is not None else ".")
            + (f" This represents a {direction} signal for {sleeve.replace('_', ' ').title()} exposure." if direction else "")
        )

        docs.append(make_document(
            source="ETF_FLOWS",
            source_type=POSITIONING,
            title=title,
            text=text,
            url=f"https://finance.yahoo.com/quote/{ticker}",
            published_at=now,
            payload={
                "ticker": ticker,
                "sleeve": sleeve,
                "label": label,
                "shares": shares,
                "price": price,
                "wow_pct": wow_pct,
                "direction": direction,
            },
        ))

    logger.info(f"ETF flows collector produced {len(docs)} positioning documents.")
    return docs
