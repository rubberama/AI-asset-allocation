"""News feeds collector — direct RSS and API-based financial news aggregation.

Pulls from a curated list of major financial news RSS feeds in parallel, plus
optional NewsAPI and Alpha Vantage News if keys are configured. All sources
return [] on failure so the pipeline degrades gracefully.

Sources (no key required):
  Reuters, CNBC, Yahoo Finance, MarketWatch, Investopedia, The Economist,
  Seeking Alpha, FT, NBER Working Papers, World Bank, Fed Research

Optional (with API key):
  NewsAPI (NEWSAPI_KEY): 100 requests/day free, structured financial news
  Alpha Vantage (ALPHAVANTAGE_API_KEY): NEWS_SENTIMENT endpoint, 25/day free
"""
import asyncio
import logging
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import httpx

from app.config import NEWSAPI_KEY, ALPHAVANTAGE_API_KEY
from app.sources.normalize import make_document, NEWS

logger = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
}
_TIMEOUT = 15.0
_MAX_AGE_DAYS = 7
_TAG_RE = re.compile(r"<[^>]+>")
_SPACE_RE = re.compile(r"\s+")

# Curated financial news RSS feeds — all public, no authentication
_RSS_FEEDS: List[Dict[str, str]] = [
    # Wire services
    {"url": "https://feeds.reuters.com/reuters/businessNews",          "source": "Reuters",        "sleeve_hint": "MACRO"},
    {"url": "https://feeds.reuters.com/reuters/companyNews",           "source": "Reuters",        "sleeve_hint": "GLOBAL_STOCK"},
    # US financial press
    {"url": "https://www.cnbc.com/id/100003114/device/rss/rss.html",  "source": "CNBC",           "sleeve_hint": "GLOBAL_STOCK"},
    {"url": "https://www.cnbc.com/id/20910258/device/rss/rss.html",   "source": "CNBC",           "sleeve_hint": "GLOBAL_BOND"},
    {"url": "https://feeds.marketwatch.com/marketwatch/topstories/",  "source": "MarketWatch",    "sleeve_hint": "GLOBAL_STOCK"},
    {"url": "https://feeds.marketwatch.com/marketwatch/marketpulse/", "source": "MarketWatch",    "sleeve_hint": "MACRO"},
    {"url": "https://finance.yahoo.com/rss/topfinstories",            "source": "YahooFinance",   "sleeve_hint": "GLOBAL_STOCK"},
    {"url": "https://www.investopedia.com/feedbuilder/feed/getfeed/?feedName=rss_top_stories",
                                                                       "source": "Investopedia",   "sleeve_hint": "MACRO"},
    # International / global macro
    {"url": "https://www.economist.com/finance-and-economics/rss.xml","source": "TheEconomist",   "sleeve_hint": "MACRO"},
    {"url": "https://www.ft.com/markets?format=rss",                  "source": "FT",             "sleeve_hint": "GLOBAL_BOND"},
    # Korea-specific
    {"url": "https://www.koreaherald.com/rss/020100000000.xml",       "source": "KoreaHerald",    "sleeve_hint": "KR_STOCK"},
    {"url": "https://en.yna.co.kr/RSS/economy.xml",                   "source": "YonhapNews",     "sleeve_hint": "KR_STOCK"},
    # Academic / institutional research
    {"url": "https://www.nber.org/rss/new_working_papers.xml",        "source": "NBER",           "sleeve_hint": "MACRO"},
    {"url": "https://www.worldbank.org/en/news/all.rss",              "source": "WorldBank",      "sleeve_hint": "GLOBAL_STOCK"},
]

# Credibility map for new sources (used by research.py SOURCE_CREDIBILITY)
SOURCE_CREDIBILITY_ADDITIONS = {
    "Reuters": 0.9, "CNBC": 0.75, "MarketWatch": 0.7, "YahooFinance": 0.65,
    "Investopedia": 0.65, "TheEconomist": 0.85, "FT": 0.9,
    "KoreaHerald": 0.7, "YonhapNews": 0.75,
    "NBER": 0.95, "WorldBank": 0.95,
}

_TAG_RE = re.compile(r"<[^>]+>")
_SPACE_RE = re.compile(r"\s+")


def _strip_tags(html: str) -> str:
    text = _TAG_RE.sub(" ", html or "")
    return _SPACE_RE.sub(" ", text).strip()


def _parse_rss_date(raw: str) -> Optional[datetime]:
    """Parse RFC-2822 or ISO pubDate; return UTC datetime or None."""
    if not raw:
        return None
    fmts = [
        "%a, %d %b %Y %H:%M:%S %z",
        "%a, %d %b %Y %H:%M:%S GMT",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%SZ",
    ]
    raw_clean = raw.strip()
    for fmt in fmts:
        try:
            return datetime.strptime(raw_clean, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return None


def _is_fresh(pub_date_str: str) -> bool:
    """Returns True if the article is within MAX_AGE_DAYS."""
    dt = _parse_rss_date(pub_date_str)
    if dt is None:
        return True  # unknown date — include it
    cutoff = datetime.now(timezone.utc) - timedelta(days=_MAX_AGE_DAYS)
    return dt >= cutoff


async def _fetch_one_rss(client: httpx.AsyncClient, feed: Dict[str, str]) -> List[Dict[str, Any]]:
    """Fetch and parse a single RSS feed. Returns [] on any error."""
    url = feed["url"]
    source = feed["source"]
    hint = feed.get("sleeve_hint", "MACRO")
    try:
        resp = await client.get(url, headers=_HEADERS, timeout=_TIMEOUT, follow_redirects=True)
        if resp.status_code != 200:
            logger.debug(f"RSS {source} returned {resp.status_code}")
            return []
        # Guard against non-XML responses
        content_type = resp.headers.get("content-type", "")
        if "html" in content_type and "xml" not in content_type:
            logger.debug(f"RSS {source} returned HTML (not XML) — skipping")
            return []
        try:
            root = ET.fromstring(resp.text)
        except ET.ParseError as e:
            logger.debug(f"RSS {source} XML parse error: {e}")
            return []

        docs = []
        items = root.findall(".//item")
        for item in items[:15]:
            title = _strip_tags(item.findtext("title", "")).strip()
            if not title or len(title) < 10:
                continue
            link = item.findtext("link", "").strip()
            desc = _strip_tags(item.findtext("description", "")).strip()[:500]
            pub = item.findtext("pubDate", "") or item.findtext("pubdate", "")
            if not _is_fresh(pub):
                continue
            domain = urlparse(link).netloc or source
            docs.append(make_document(
                source=source,
                source_type=NEWS,
                title=title,
                text=desc or title,
                url=link,
                published_at=pub,
                payload={"domain": domain, "sleeve_hint": hint, "feed_url": url},
            ))
        logger.debug(f"RSS {source}: {len(docs)} fresh articles")
        return docs
    except Exception as e:
        logger.debug(f"RSS {source} failed: {e}")
        return []


# ── NewsAPI (optional, requires NEWSAPI_KEY) ──────────────────────────────────

_NEWSAPI_QUERIES = [
    ("macroeconomic policy interest rates central bank",          "MACRO"),
    ("equity market earnings valuation stock index",             "GLOBAL_STOCK"),
    ("Korea KOSPI Bank of Korea Korean economy",                 "KR_STOCK"),
    ("bond yield treasury duration fixed income credit spread",  "GLOBAL_BOND"),
    ("commodity gold oil alternative investment REIT",           "ALTERNATIVE"),
]


async def _fetch_newsapi(client: httpx.AsyncClient) -> List[Dict[str, Any]]:
    """Pulls structured financial news from NewsAPI (free tier: 100 req/day)."""
    if not NEWSAPI_KEY:
        return []
    docs = []
    from_date = (datetime.utcnow() - timedelta(days=_MAX_AGE_DAYS)).strftime("%Y-%m-%d")
    for query, hint in _NEWSAPI_QUERIES:
        try:
            resp = await client.get(
                "https://newsapi.org/v2/everything",
                params={
                    "q": query,
                    "language": "en",
                    "sortBy": "publishedAt",
                    "pageSize": 10,
                    "from": from_date,
                    "apiKey": NEWSAPI_KEY,
                },
                timeout=_TIMEOUT,
            )
            if resp.status_code != 200:
                logger.warning(f"NewsAPI returned {resp.status_code} for query: {query[:40]}")
                continue
            for art in resp.json().get("articles", []):
                title = art.get("title", "").strip()
                if not title or title == "[Removed]":
                    continue
                desc = (art.get("description") or art.get("content") or "").strip()[:500]
                source_name = (art.get("source") or {}).get("name", "NewsAPI")
                docs.append(make_document(
                    source=source_name,
                    source_type=NEWS,
                    title=title,
                    text=desc or title,
                    url=art.get("url", ""),
                    published_at=art.get("publishedAt", ""),
                    payload={"sleeve_hint": hint, "provider": "NewsAPI"},
                ))
        except Exception as e:
            logger.warning(f"NewsAPI query failed: {e}")
    logger.info(f"NewsAPI collector produced {len(docs)} articles.")
    return docs


# ── Alpha Vantage News Sentiment (optional, requires ALPHAVANTAGE_API_KEY) ───

_AV_TOPICS = [
    ("economy_macro",         "MACRO"),
    ("financial_markets",     "GLOBAL_STOCK"),
    ("earnings",              "GLOBAL_STOCK"),
    ("economy_fiscal",        "GLOBAL_BOND"),
    ("ipo",                   "GLOBAL_STOCK"),
]


async def _fetch_alphavantage_news(client: httpx.AsyncClient) -> List[Dict[str, Any]]:
    """Pulls sentiment-scored financial news from Alpha Vantage (free: 25 req/day)."""
    if not ALPHAVANTAGE_API_KEY:
        return []
    docs = []
    seen_urls = set()
    for topic, hint in _AV_TOPICS:
        try:
            resp = await client.get(
                "https://www.alphavantage.co/query",
                params={
                    "function": "NEWS_SENTIMENT",
                    "topics": topic,
                    "sort": "LATEST",
                    "limit": 10,
                    "apikey": ALPHAVANTAGE_API_KEY,
                },
                timeout=_TIMEOUT,
            )
            if resp.status_code != 200:
                continue
            for item in resp.json().get("feed", []):
                url = item.get("url", "")
                if url in seen_urls:
                    continue
                seen_urls.add(url)
                title = item.get("title", "").strip()
                if not title:
                    continue
                summary = item.get("summary", "").strip()[:500]
                sentiment = item.get("overall_sentiment_label", "")
                source_name = item.get("source", "AlphaVantage")
                docs.append(make_document(
                    source=source_name,
                    source_type=NEWS,
                    title=title,
                    text=summary or title,
                    url=url,
                    published_at=item.get("time_published", ""),
                    payload={
                        "sleeve_hint": hint,
                        "sentiment": sentiment,
                        "sentiment_score": item.get("overall_sentiment_score"),
                        "provider": "AlphaVantage",
                    },
                ))
        except Exception as e:
            logger.warning(f"Alpha Vantage news query failed: {e}")
    logger.info(f"Alpha Vantage news collector produced {len(docs)} articles.")
    return docs


# ── Top-level orchestrator ─────────────────────────────────────────────────────

async def fetch_news_feeds() -> List[Dict[str, Any]]:
    """Fetches all RSS feeds and optional API news sources in parallel."""
    async with httpx.AsyncClient() as client:
        rss_tasks = [_fetch_one_rss(client, feed) for feed in _RSS_FEEDS]
        api_tasks = [
            _fetch_newsapi(client),
            _fetch_alphavantage_news(client),
        ]
        results = await asyncio.gather(*rss_tasks, *api_tasks, return_exceptions=True)

    docs = []
    seen_ids = set()
    for r in results:
        if not isinstance(r, list):
            continue
        for d in r:
            if d["id"] not in seen_ids:
                seen_ids.add(d["id"])
                docs.append(d)

    logger.info(f"News feeds collector produced {len(docs)} unique articles.")
    return docs
