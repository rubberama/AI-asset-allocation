"""ECOS (Bank of Korea) collector — Korean macro equivalents of FRED.

Requires a free ECOS_API_KEY from https://ecos.bok.or.kr/.
Returns [] if the key is absent so the pipeline falls back to other sources.
"""
import logging
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.config import ECOS_API_KEY, ECOS_API_URL
from app.sources.normalize import make_document, MACRO_DATA

logger = logging.getLogger(__name__)

# (stat_code, item_code, human_name, hint)
ECOS_SERIES: List[Tuple[str, str, str, str]] = [
    ("722Y001", "0101000", "BOK Base Rate",               "rates"),
    ("901Y009", "0",       "Korean CPI (YoY %)",          "inflation"),
    ("404Y014", "BPJI00",  "Korean PPI (YoY %)",          "inflation"),
    ("301Y013", "S11015",  "Korean Trade Balance (USD M)", "fx"),
    ("301Y017", "S11015",  "Current Account Balance",     "fx"),
    ("101Y002", "BBHS00",  "M2 Money Supply (KRW B)",     "growth"),
    ("251Y003", "AABF00",  "Household Credit (KRW T)",    "growth"),
]


async def fetch_ecos_series(series: List[Tuple] = None) -> List[Dict[str, Any]]:
    """Fetches the latest observations for each ECOS Korean macro series."""
    if not ECOS_API_KEY:
        logger.info("ECOS_API_KEY not set. Skipping ECOS collection.")
        return []

    series = series or ECOS_SERIES
    docs: List[Dict[str, Any]] = []

    async with httpx.AsyncClient() as client:
        for stat_code, item_code, name, hint in series:
            url = (
                f"{ECOS_API_URL}/{ECOS_API_KEY}/json/en/1/10"
                f"/{stat_code}/M/20230101/20261231/{item_code}/"
            )
            try:
                resp = await client.get(url, timeout=12.0)
                if resp.status_code != 200:
                    logger.warning(f"ECOS {stat_code} returned {resp.status_code}")
                    continue
                data = resp.json()
                rows = (data.get("StatisticSearch") or {}).get("row", [])
                # Filter out missing values and sort descending by TIME
                rows = [r for r in rows if r.get("DATA_VALUE") not in (None, "-", "")]
                if not rows:
                    continue
                rows.sort(key=lambda r: r.get("TIME", ""), reverse=True)
                latest = rows[0]
                prior = rows[1] if len(rows) > 1 else None

                try:
                    val = float(latest["DATA_VALUE"])
                except (ValueError, TypeError):
                    continue
                prior_val: Optional[float] = None
                change: Optional[float] = None
                if prior:
                    try:
                        prior_val = float(prior["DATA_VALUE"])
                        change = round(val - prior_val, 4)
                    except (ValueError, TypeError):
                        pass

                period = latest.get("TIME", "")
                # Convert YYYYMM → YYYY-MM-01
                if len(period) == 6 and period.isdigit():
                    published_at = f"{period[:4]}-{period[4:6]}-01"
                elif len(period) == 4 and period.isdigit():
                    published_at = f"{period}-01-01"
                else:
                    published_at = period

                arrow = "" if change is None else (f" (▲ {change:+.3f} vs prior)" if change else " (flat)")
                title = f"{name} [{stat_code}]: {val}{arrow}"
                text = (
                    f"Latest {name} reading is {val} as of {period}"
                    + (f", a change of {change:+.3f} from the prior print." if change is not None else ".")
                    + f" (macro driver: {hint})"
                )
                docs.append(make_document(
                    source="ECOS",
                    source_type=MACRO_DATA,
                    title=title,
                    text=text,
                    url=f"https://ecos.bok.or.kr/#/SearchStat",
                    published_at=published_at,
                    payload={"stat_code": stat_code, "item_code": item_code, "value": val,
                             "change": change, "hint": hint},
                ))
            except Exception as e:
                logger.warning(f"Failed to fetch ECOS series {stat_code}: {e}")

    logger.info(f"ECOS collector produced {len(docs)} macro documents.")
    return docs
