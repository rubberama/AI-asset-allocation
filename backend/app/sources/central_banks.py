"""Central bank publications collector — Fed Beige Book, BOK MPB minutes,
ECB RSS, IMF WEO, and BIS Quarterly Review.

All sub-fetchers are wrapped in try/except and return [] on any failure so the
pipeline continues gracefully. No API keys required.
"""
import asyncio
import logging
import re
import xml.etree.ElementTree as ET
from typing import Any, Dict, List

import httpx

from app.config import (
    FED_BEIGE_BOOK_URL, BOK_MPB_URL, ECB_RSS_URL, IMF_WEO_URL, BIS_QR_URL,
)
from app.sources.normalize import make_document, CB_PUBLICATION

logger = logging.getLogger(__name__)

_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; NPS-Research-Bot/1.0)"}
_TIMEOUT = 20.0

_TAG_RE = re.compile(r"<[^>]+>")
_SPACE_RE = re.compile(r"\s+")


def _strip_tags(html: str) -> str:
    text = _TAG_RE.sub(" ", html)
    return _SPACE_RE.sub(" ", text).strip()


def _extract_paragraphs(html: str, max_chars: int = 2000) -> str:
    paras = re.findall(r"<p[^>]*>(.*?)</p>", html, re.DOTALL | re.IGNORECASE)
    out = []
    total = 0
    for p in paras:
        clean = _strip_tags(p).strip()
        if len(clean) < 30:
            continue
        out.append(clean)
        total += len(clean)
        if total >= max_chars:
            break
    return " ".join(out)[:max_chars]


# ── Fed Beige Book ────────────────────────────────────────────────────────────

async def _fetch_beige_book(client: httpx.AsyncClient) -> List[Dict[str, Any]]:
    try:
        resp = await client.get(FED_BEIGE_BOOK_URL, headers=_HEADERS, timeout=_TIMEOUT)
        if resp.status_code != 200:
            return []
        html = resp.text
        # Find most recent Beige Book link pattern: /monetarypolicy/beigebook/YYYYMM
        matches = re.findall(r"/monetarypolicy/beigebook/(\d{6})", html)
        if not matches:
            return []
        latest = sorted(matches)[-1]  # lexicographic sort picks most recent YYYYMM
        detail_url = f"https://www.federalreserve.gov/monetarypolicy/beigebook/{latest}20.htm"
        resp2 = await client.get(detail_url, headers=_HEADERS, timeout=_TIMEOUT)
        if resp2.status_code != 200:
            # Try alternate URL pattern
            detail_url = f"https://www.federalreserve.gov/monetarypolicy/beigebook/{latest}.htm"
            resp2 = await client.get(detail_url, headers=_HEADERS, timeout=_TIMEOUT)
        body = _extract_paragraphs(resp2.text if resp2.status_code == 200 else html)
        published_at = f"{latest[:4]}-{latest[4:6]}-01"
        return [make_document(
            source="FederalReserve",
            source_type=CB_PUBLICATION,
            title=f"Federal Reserve Beige Book ({latest[:4]}-{latest[4:6]})",
            text=body or "Fed Beige Book: summary of economic conditions across Federal Reserve Districts.",
            url=detail_url,
            published_at=published_at,
            payload={"publication": "Beige Book", "period": latest},
        )]
    except Exception as e:
        logger.warning(f"Fed Beige Book fetch failed: {e}")
        return []


# ── BOK Monetary Policy Board Minutes ─────────────────────────────────────────

async def _fetch_bok_mpb(client: httpx.AsyncClient) -> List[Dict[str, Any]]:
    try:
        resp = await client.get(BOK_MPB_URL, headers=_HEADERS, timeout=_TIMEOUT, follow_redirects=True)
        if resp.status_code != 200:
            return []
        html = resp.text
        # Extract first article link and title from the list page
        links = re.findall(r'href="(/eng/bbs/B0000160/view\.do\?nttId=\d+[^"]*)"', html)
        titles = re.findall(r'<td[^>]*class="[^"]*subject[^"]*"[^>]*>(.*?)</td>', html, re.DOTALL)
        if not links:
            return []
        detail_url = "https://www.bok.or.kr" + links[0]
        title_text = _strip_tags(titles[0]).strip() if titles else "BOK Monetary Policy Board Minutes"
        resp2 = await client.get(detail_url, headers=_HEADERS, timeout=_TIMEOUT, follow_redirects=True)
        body = _extract_paragraphs(resp2.text if resp2.status_code == 200 else "") or \
               "Bank of Korea Monetary Policy Board meeting minutes and decision summary."
        return [make_document(
            source="BOK_MPB",
            source_type=CB_PUBLICATION,
            title=title_text,
            text=body,
            url=detail_url,
            payload={"publication": "BOK MPB Minutes"},
        )]
    except Exception as e:
        logger.warning(f"BOK MPB fetch failed: {e}")
        return []


# ── ECB RSS ────────────────────────────────────────────────────────────────────

async def _fetch_ecb_rss(client: httpx.AsyncClient) -> List[Dict[str, Any]]:
    try:
        resp = await client.get(ECB_RSS_URL, headers=_HEADERS, timeout=_TIMEOUT)
        if resp.status_code != 200:
            return []
        root = ET.fromstring(resp.text)
        docs = []
        for item in root.findall(".//item")[:5]:
            title = item.findtext("title", "").strip()
            link = item.findtext("link", "").strip()
            desc = _strip_tags(item.findtext("description", "")).strip()
            pub = item.findtext("pubDate", "").strip()
            if not title:
                continue
            docs.append(make_document(
                source="ECB",
                source_type=CB_PUBLICATION,
                title=title,
                text=desc or title,
                url=link,
                published_at=pub,
                payload={"publication": "ECB Press Release"},
            ))
        return docs
    except Exception as e:
        logger.warning(f"ECB RSS fetch failed: {e}")
        return []


# ── IMF World Economic Outlook ────────────────────────────────────────────────

async def _fetch_imf_weo(client: httpx.AsyncClient) -> List[Dict[str, Any]]:
    try:
        resp = await client.get(IMF_WEO_URL, headers=_HEADERS, timeout=_TIMEOUT, follow_redirects=True)
        if resp.status_code != 200:
            return []
        html = resp.text
        body = _extract_paragraphs(html, max_chars=1500)
        # Try to find a publication date
        date_m = re.search(r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}", html)
        pub_date = date_m.group(0) if date_m else ""
        title = f"IMF World Economic Outlook{f' — {pub_date}' if pub_date else ''}"
        return [make_document(
            source="IMF",
            source_type=CB_PUBLICATION,
            title=title,
            text=body or "IMF World Economic Outlook: global growth projections and risks.",
            url=IMF_WEO_URL,
            payload={"publication": "IMF WEO"},
        )]
    except Exception as e:
        logger.warning(f"IMF WEO fetch failed: {e}")
        return []


# ── BIS Quarterly Review ──────────────────────────────────────────────────────

async def _fetch_bis_qr(client: httpx.AsyncClient) -> List[Dict[str, Any]]:
    try:
        resp = await client.get(BIS_QR_URL, headers=_HEADERS, timeout=_TIMEOUT, follow_redirects=True)
        if resp.status_code != 200:
            return []
        html = resp.text
        # Find first link to an HTML overview (pattern: /publ/qtrpdf/rXXXX.htm)
        links = re.findall(r'href="(/publ/qtrpdf/r\w+\.htm)"', html)
        body = _extract_paragraphs(html, max_chars=1200)
        detail_url = ("https://www.bis.org" + links[0]) if links else BIS_QR_URL
        return [make_document(
            source="BIS",
            source_type=CB_PUBLICATION,
            title="BIS Quarterly Review — International Banking and Financial Market Developments",
            text=body or "BIS Quarterly Review: international banking statistics and financial market developments.",
            url=detail_url,
            payload={"publication": "BIS Quarterly Review"},
        )]
    except Exception as e:
        logger.warning(f"BIS QR fetch failed: {e}")
        return []


# ── Top-level orchestrator ─────────────────────────────────────────────────────

async def fetch_central_bank_docs() -> List[Dict[str, Any]]:
    """Runs all five central-bank sub-fetchers concurrently and merges results."""
    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(
            _fetch_beige_book(client),
            _fetch_bok_mpb(client),
            _fetch_ecb_rss(client),
            _fetch_imf_weo(client),
            _fetch_bis_qr(client),
            return_exceptions=True,
        )
    docs = []
    for r in results:
        if isinstance(r, list):
            docs.extend(r)
    logger.info(f"Central bank collector produced {len(docs)} documents.")
    return docs
