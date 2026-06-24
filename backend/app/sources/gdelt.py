"""GDELT collector — pulls recent global news on macro / policy / geopolitics themes
from the GDELT DOC 2.0 API (no API key required) into NEWS Documents.

GDELT is well suited to top-down signals: monetary policy, geopolitics, trade/energy
shocks, and macro narrative — exactly the inputs that move asset-class allocation.
"""
import logging
from typing import Any, Dict, List

import httpx

from app.config import GDELT_API_URL
from app.sources.normalize import make_document, NEWS

logger = logging.getLogger(__name__)

# Macro/geopolitics queries. Each is a focused theme; results are merged + de-duped later.
GDELT_QUERIES = [
    '("monetary policy" OR "interest rate" OR "central bank" OR "Federal Reserve")',
    '(inflation OR "consumer prices" OR "rate cut" OR "rate hike")',
    '(geopolitical OR sanctions OR "trade war" OR tariffs OR "supply chain")',
    '("global economy" OR recession OR "economic growth" OR "fiscal policy")',
    '("Bank of Korea" OR "Korean won" OR "Korea economy" OR KOSPI)',
]


async def fetch_gdelt_articles(
    queries: List[str] = None,
    timespan: str = "3d",
    per_query: int = 5,
) -> List[Dict[str, Any]]:
    """Fetches recent articles for each macro/geopolitics query."""
    queries = queries or GDELT_QUERIES
    docs: List[Dict[str, Any]] = []
    seen_urls = set()

    async with httpx.AsyncClient() as client:
        for q in queries:
            params = {
                "query": q,
                "mode": "ArtList",
                "format": "json",
                "maxrecords": per_query,
                "timespan": timespan,
                "sort": "DateDesc",
            }
            try:
                resp = await client.get(GDELT_API_URL, params=params, timeout=15.0)
                if resp.status_code != 200:
                    logger.warning(f"GDELT query returned {resp.status_code} for: {q}")
                    continue
                # GDELT occasionally returns non-JSON (HTML error / empty). Guard the parse.
                try:
                    articles = resp.json().get("articles", [])
                except Exception:
                    logger.warning(f"GDELT returned non-JSON for query: {q}")
                    continue
                for a in articles:
                    url = a.get("url", "")
                    if not url or url in seen_urls:
                        continue
                    seen_urls.add(url)
                    docs.append(make_document(
                        source=a.get("domain", "GDELT"),
                        source_type=NEWS,
                        title=a.get("title", ""),
                        text=a.get("title", ""),  # DOC API gives title; full text fetched on demand later
                        url=url,
                        published_at=a.get("seendate", ""),
                        payload={
                            "domain": a.get("domain"),
                            "sourcecountry": a.get("sourcecountry"),
                            "language": a.get("language"),
                            "gdelt_query": q,
                        },
                    ))
            except Exception as e:
                logger.warning(f"Failed GDELT query '{q}': {e}")

    logger.info(f"GDELT collector produced {len(docs)} news documents.")
    return docs
