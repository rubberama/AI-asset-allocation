"""FRED collector — pulls hard US macro series and turns the latest reading of each
into a MACRO_DATA Document (latest value, change vs prior observation).

Requires a free FRED_API_KEY. If the key is absent, returns [] so the pipeline falls
back to other sources (mirrors the Marketaux key-optional behavior).
"""
import logging
from typing import Any, Dict, List

import httpx

from app.config import FRED_API_KEY, FRED_API_URL
from app.sources.normalize import make_document, MACRO_DATA

logger = logging.getLogger(__name__)

# Seed macro series: (series_id, human name, hint of which sleeves it most informs)
FRED_SERIES = [
    ("CPIAUCSL", "US CPI (headline)", "inflation"),
    ("PCEPILFE", "US Core PCE", "inflation"),
    ("UNRATE", "US Unemployment Rate", "growth"),
    ("FEDFUNDS", "US Fed Funds Rate", "rates"),
    ("DGS10", "US 10Y Treasury Yield", "rates"),
    ("DGS2", "US 2Y Treasury Yield", "rates"),
    ("T10Y2Y", "US 10Y-2Y Yield Spread", "rates"),
    ("GDPC1", "US Real GDP", "growth"),
    ("INDPRO", "US Industrial Production", "growth"),
    ("DTWEXBGS", "US Dollar Broad Index", "fx"),
]


async def fetch_fred_series(series: List[tuple] = None) -> List[Dict[str, Any]]:
    """Fetches the latest observation (and prior, for delta) of each FRED series."""
    if not FRED_API_KEY:
        logger.info("FRED_API_KEY not set. Skipping FRED collection.")
        return []

    series = series or FRED_SERIES
    docs: List[Dict[str, Any]] = []

    async with httpx.AsyncClient() as client:
        for series_id, name, hint in series:
            params = {
                "series_id": series_id,
                "api_key": FRED_API_KEY,
                "file_type": "json",
                "sort_order": "desc",
                "limit": 2,  # latest + prior, to compute change
            }
            try:
                resp = await client.get(FRED_API_URL, params=params, timeout=12.0)
                if resp.status_code != 200:
                    logger.warning(f"FRED {series_id} returned {resp.status_code}")
                    continue
                obs = resp.json().get("observations", [])
                obs = [o for o in obs if o.get("value") not in (None, ".", "")]
                if not obs:
                    continue
                latest = float(obs[0]["value"])
                prior = float(obs[1]["value"]) if len(obs) > 1 else None
                change = round(latest - prior, 4) if prior is not None else None
                date = obs[0].get("date", "")

                arrow = "" if change is None else (" (▲ %+.3f vs prior)" % change if change else " (flat)")
                title = f"{name} [{series_id}]: {latest}{arrow}"
                text = (
                    f"Latest {name} reading is {latest} as of {date}"
                    + (f", a change of {change:+.3f} from the prior print." if change is not None else ".")
                    + f" (macro driver: {hint})"
                )
                docs.append(make_document(
                    source="FRED",
                    source_type=MACRO_DATA,
                    title=title,
                    text=text,
                    url=f"https://fred.stlouisfed.org/series/{series_id}",
                    published_at=date,
                    payload={"series_id": series_id, "value": latest, "change": change, "hint": hint},
                ))
            except Exception as e:
                logger.warning(f"Failed to fetch FRED series {series_id}: {e}")

    logger.info(f"FRED collector produced {len(docs)} macro documents.")
    return docs
