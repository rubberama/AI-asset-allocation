"""CFTC Commitments of Traders (COT) collector — net large-speculator positioning.

Fetches the public weekly FinFutWk.txt CSV (no API key required) and extracts
net speculator positions for S&P 500, 10-Year Treasury, and Gold futures as
directional POSITIONING signals mapped to the five asset sleeves.
"""
import io
import logging
from datetime import datetime
from typing import Any, Dict, List

import httpx
import pandas as pd

from app.config import CFTC_COT_URL
from app.sources.normalize import make_document, POSITIONING

logger = logging.getLogger(__name__)

# (substring to match in col[0] of FinFutWk.txt, sleeve hint, asset label)
# FinFutWk.txt covers financial futures only (no commodities like gold).
_COT_TARGETS = [
    ("E-MINI S&P 500 - CHICAGO MERCANTILE EXCHANGE", "GLOBAL_STOCK", "E-Mini S&P 500 Futures"),
    ("UST 10Y NOTE",                                  "GLOBAL_BOND",  "10-Year Treasury Note Futures"),
    ("BITCOIN - CHICAGO MERCANTILE EXCHANGE",         "ALTERNATIVE",  "Bitcoin Futures (CME)"),
    ("VIX FUTURES",                                   "ALTERNATIVE",  "VIX Futures (Volatility)"),
    ("USD INDEX",                                     "KR_STOCK",     "USD Index Futures (FX)"),
]


async def fetch_cftc_cot() -> List[Dict[str, Any]]:
    """Downloads the CFTC weekly FinFutWk.txt and extracts net speculator positions."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(CFTC_COT_URL, timeout=30.0)
        if resp.status_code != 200:
            logger.warning(f"CFTC COT returned {resp.status_code}")
            return []
        text = resp.text
    except Exception as e:
        logger.warning(f"CFTC COT fetch failed: {e}")
        return []

    try:
        # FinFutWk.txt has no header row — use positional column access.
        # Confirmed column layout (0-indexed):
        #   0 = Market_and_Exchange_Names
        #   1 = As_of_Date_In_Form_YYMMDD
        #   8 = NonComm_Positions_Long_All
        #   9 = NonComm_Positions_Short_All
        df = pd.read_csv(io.StringIO(text), header=None, skipinitialspace=True, low_memory=False)
    except Exception as e:
        logger.warning(f"CFTC COT CSV parse failed: {e}")
        return []

    docs: List[Dict[str, Any]] = []

    for substr, asset_hint, contract_name in _COT_TARGETS:
        try:
            mask = df.iloc[:, 0].astype(str).str.contains(substr, case=False, na=False)
            matched = df[mask]
            if matched.empty:
                logger.warning(f"CFTC: no row matched for '{substr}'")
                continue
            row = matched.iloc[0]

            long_val = int(str(row.iloc[8]).replace(",", ""))
            short_val = int(str(row.iloc[9]).replace(",", ""))
            net_spec = long_val - short_val
            direction = "bullish" if net_spec > 0 else "bearish"

            # Col[1] is YYMMDD format (e.g., 260616 = 2026-06-16)
            yymmdd = str(row.iloc[1]).strip()
            try:
                published_at = datetime.strptime(yymmdd, "%y%m%d").strftime("%Y-%m-%d")
            except ValueError:
                published_at = None

            title = (
                f"CFTC COT {contract_name}: net spec {net_spec:+,} contracts ({direction})"
            )
            text = (
                f"CFTC Commitments of Traders (as of {published_at}): large speculator net position "
                f"in {contract_name} is {net_spec:+,} contracts ({direction}). "
                f"Long: {long_val:,}, Short: {short_val:,}. "
                f"Signal: {direction} positioning in {asset_hint.replace('_', ' ').title()}."
            )
            docs.append(make_document(
                source="CFTC",
                source_type=POSITIONING,
                title=title,
                text=text,
                url=f"https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm#{contract_name.replace(' ', '_')}",
                published_at=published_at,
                payload={
                    "contract": contract_name,
                    "asset_hint": asset_hint,
                    "net_spec": net_spec,
                    "long": long_val,
                    "short": short_val,
                    "direction": direction,
                },
            ))
        except Exception as e:
            logger.warning(f"CFTC: failed to process '{substr}': {e}")

    logger.info(f"CFTC collector produced {len(docs)} positioning documents.")
    return docs
