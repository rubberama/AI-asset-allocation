"""Commercial bank & policy research collector — best-effort public page scraping.

Scrapes publicly accessible article listings from Goldman Sachs, Morgan Stanley,
JPMorgan Chase Institute, Brookings Institution, and PIIE. All scrapers return []
on any failure. Can be disabled via BANK_RESEARCH_ENABLED=false in env.
"""
import asyncio
import logging
import re
from typing import Any, Dict, List

import httpx

from app.config import BANK_RESEARCH_ENABLED
from app.sources.normalize import make_document, NEWS

logger = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}
_TIMEOUT = 15.0
_TAG_RE = re.compile(r"<[^>]+>")
_SPACE_RE = re.compile(r"\s+")
_MAX_ARTICLES = 5


def _strip_tags(html: str) -> str:
    text = _TAG_RE.sub(" ", html)
    return _SPACE_RE.sub(" ", text).strip()


def _extract_articles_generic(
    html: str,
    title_pattern: str,
    snippet_pattern: str = None,
    url_pattern: str = None,
    base_url: str = "",
) -> List[Dict[str, str]]:
    """Extract up to _MAX_ARTICLES from raw HTML using regex patterns."""
    titles = re.findall(title_pattern, html, re.DOTALL | re.IGNORECASE)
    snippets = re.findall(snippet_pattern, html, re.DOTALL | re.IGNORECASE) if snippet_pattern else []
    urls = re.findall(url_pattern, html, re.IGNORECASE) if url_pattern else []

    articles = []
    for i, raw_title in enumerate(titles[:_MAX_ARTICLES]):
        title = _strip_tags(raw_title).strip()
        if not title or len(title) < 10:
            continue
        snippet = _strip_tags(snippets[i]).strip()[:400] if i < len(snippets) else ""
        url = (base_url + urls[i]) if i < len(urls) else base_url
        articles.append({"title": title, "snippet": snippet, "url": url})
    return articles


# ── Goldman Sachs ─────────────────────────────────────────────────────────────

async def _scrape_gs(client: httpx.AsyncClient) -> List[Dict[str, Any]]:
    url = "https://www.goldmansachs.com/intelligence/"
    try:
        resp = await client.get(url, headers=_HEADERS, timeout=_TIMEOUT, follow_redirects=True)
        if resp.status_code != 200:
            return []
        articles = _extract_articles_generic(
            resp.text,
            title_pattern=r'<h[23][^>]*class="[^"]*(?:title|headline)[^"]*"[^>]*>(.*?)</h[23]>',
            snippet_pattern=r'<p[^>]*class="[^"]*(?:desc|summary|excerpt|teaser)[^"]*"[^>]*>(.*?)</p>',
            url_pattern=r'<a[^>]+href="(/intelligence/[^"]+)"',
            base_url="https://www.goldmansachs.com",
        )
        return [
            make_document(
                source="GoldmanSachs",
                source_type=NEWS,
                title=a["title"],
                text=a["snippet"] or a["title"],
                url=a["url"],
                payload={"institution": "Goldman Sachs", "section": "Insights"},
            )
            for a in articles
        ]
    except Exception as e:
        logger.warning(f"Goldman Sachs scrape failed: {e}")
        return []


# ── Morgan Stanley ────────────────────────────────────────────────────────────

async def _scrape_ms(client: httpx.AsyncClient) -> List[Dict[str, Any]]:
    url = "https://www.morganstanley.com/ideas/"
    try:
        resp = await client.get(url, headers=_HEADERS, timeout=_TIMEOUT, follow_redirects=True)
        if resp.status_code != 200:
            return []
        articles = _extract_articles_generic(
            resp.text,
            title_pattern=r'<h[23][^>]*>(.*?)</h[23]>',
            snippet_pattern=r'<p[^>]*class="[^"]*(?:description|summary|intro)[^"]*"[^>]*>(.*?)</p>',
            url_pattern=r'<a[^>]+href="(/ideas/[^"?]+)"',
            base_url="https://www.morganstanley.com",
        )
        return [
            make_document(
                source="MorganStanley",
                source_type=NEWS,
                title=a["title"],
                text=a["snippet"] or a["title"],
                url=a["url"],
                payload={"institution": "Morgan Stanley", "section": "Ideas"},
            )
            for a in articles
        ]
    except Exception as e:
        logger.warning(f"Morgan Stanley scrape failed: {e}")
        return []


# ── JPMorgan Chase Institute ──────────────────────────────────────────────────

async def _scrape_jpm(client: httpx.AsyncClient) -> List[Dict[str, Any]]:
    url = "https://www.jpmorganchase.com/institute/research"
    try:
        resp = await client.get(url, headers=_HEADERS, timeout=_TIMEOUT, follow_redirects=True)
        if resp.status_code != 200:
            return []
        articles = _extract_articles_generic(
            resp.text,
            title_pattern=r'<h[23][^>]*>(.*?)</h[23]>',
            snippet_pattern=r'<p[^>]*>(.*?)</p>',
            url_pattern=r'<a[^>]+href="(/institute/research/[^"?]+)"',
            base_url="https://www.jpmorganchase.com",
        )
        return [
            make_document(
                source="JPMorgan",
                source_type=NEWS,
                title=a["title"],
                text=a["snippet"] or a["title"],
                url=a["url"],
                payload={"institution": "JPMorgan Chase Institute", "section": "Research"},
            )
            for a in articles
        ]
    except Exception as e:
        logger.warning(f"JPMorgan scrape failed: {e}")
        return []


# ── Brookings Institution ─────────────────────────────────────────────────────

async def _scrape_brookings(client: httpx.AsyncClient) -> List[Dict[str, Any]]:
    url = "https://www.brookings.edu/research-area/economic-studies/"
    try:
        resp = await client.get(url, headers=_HEADERS, timeout=_TIMEOUT, follow_redirects=True)
        if resp.status_code != 200:
            return []
        articles = _extract_articles_generic(
            resp.text,
            title_pattern=r'<h[234][^>]*class="[^"]*(?:title|entry-title)[^"]*"[^>]*>(.*?)</h[234]>',
            snippet_pattern=r'<p[^>]*class="[^"]*(?:excerpt|summary|description)[^"]*"[^>]*>(.*?)</p>',
            url_pattern=r'<a[^>]+href="(https://www\.brookings\.edu/[^"]+)"',
            base_url="",
        )
        return [
            make_document(
                source="Brookings",
                source_type=NEWS,
                title=a["title"],
                text=a["snippet"] or a["title"],
                url=a["url"],
                payload={"institution": "Brookings Institution", "section": "Economic Studies"},
            )
            for a in articles
        ]
    except Exception as e:
        logger.warning(f"Brookings scrape failed: {e}")
        return []


# ── PIIE (Peterson Institute for International Economics) ─────────────────────

async def _scrape_piie(client: httpx.AsyncClient) -> List[Dict[str, Any]]:
    url = "https://www.piie.com/research"
    try:
        resp = await client.get(url, headers=_HEADERS, timeout=_TIMEOUT, follow_redirects=True)
        if resp.status_code != 200:
            return []
        articles = _extract_articles_generic(
            resp.text,
            title_pattern=r'<h[234][^>]*>(.*?)</h[234]>',
            snippet_pattern=r'<div[^>]*class="[^"]*views-field-body[^"]*"[^>]*>(.*?)</div>',
            url_pattern=r'<a[^>]+href="(/research/[^"?]+)"',
            base_url="https://www.piie.com",
        )
        return [
            make_document(
                source="PIIE",
                source_type=NEWS,
                title=a["title"],
                text=a["snippet"] or a["title"],
                url=a["url"],
                payload={"institution": "PIIE", "section": "Research"},
            )
            for a in articles
        ]
    except Exception as e:
        logger.warning(f"PIIE scrape failed: {e}")
        return []


# ── Top-level orchestrator ─────────────────────────────────────────────────────

async def fetch_bank_research_docs() -> List[Dict[str, Any]]:
    """Runs all five bank research scrapers concurrently. Returns [] if disabled."""
    if not BANK_RESEARCH_ENABLED:
        logger.info("BANK_RESEARCH_ENABLED=false; skipping commercial bank research.")
        return []

    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(
            _scrape_gs(client),
            _scrape_ms(client),
            _scrape_jpm(client),
            _scrape_brookings(client),
            _scrape_piie(client),
            return_exceptions=True,
        )
    docs = []
    for r in results:
        if isinstance(r, list):
            docs.extend(r)
    logger.info(f"Bank research collector produced {len(docs)} documents.")
    return docs
