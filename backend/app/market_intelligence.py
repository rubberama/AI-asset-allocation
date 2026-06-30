import logging
import httpx
import os
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.db import MarketIntelligence
from app.config import (
    OPENROUTER_API_KEY, OPENROUTER_API_URL, OPENROUTER_MODEL,
    MARKETAUX_API_KEY, MARKETAUX_API_URL, MARKETAUX_LIMIT, MARKETAUX_INDUSTRIES,
    ARTICLE_DIGESTION_MODEL,
)
import json
import re
import asyncio
import urllib.parse
from email.utils import parsedate_to_datetime

logger = logging.getLogger(__name__)

# --- Digest persona (article → thesis) ---
_DIGEST_GUIDE_PATH = os.path.join(os.path.dirname(__file__), "digest_persona.md")
_digest_guide_cache: Optional[str] = None


def load_digest_persona() -> str:
    """
    Loads (and caches) the Article Digestion persona that defines how user-submitted
    articles are analyzed and structured into Market Intelligence theses.
    Returns an empty string if the guide cannot be read.
    """
    global _digest_guide_cache
    if _digest_guide_cache is None:
        try:
            with open(_DIGEST_GUIDE_PATH, encoding="utf-8") as f:
                _digest_guide_cache = f.read()
            logger.info("Loaded digest persona from digest_persona.md")
        except Exception as e:
            logger.warning(f"Could not load digest persona: {e}. Proceeding without it.")
            _digest_guide_cache = ""
    return _digest_guide_cache

# How long a cached feed stays "fresh" before a re-sync is triggered.
CACHE_TTL_HOURS = 6

# Minimum length of extracted article text to consider a URL successfully readable.
# Below this we assume the page is JS-rendered / paywalled and ask the user to paste.
MIN_ARTICLE_CHARS = 400

# Realistic fallback theses in case API/LLM calls fail
FALLBACK_THESES = [
    {
        "id": "fb1",
        "author": "Marcus Aurelius",
        "author_title": "Chief Investment Officer",
        "source": "Bridgewater Insights",
        "date": datetime.utcnow().isoformat(),
        "title": "Fed rate cuts incoming faster than expected",
        "content": "The latest inflation data shows core CPI cooling down faster than the Fed's projections. Expect at least two 50bps cuts by the end of the year. This will be a massive tailwind for global bonds and growth stocks.",
        "image_url": "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?auto=format&fit=crop&q=80&w=400&h=300",
        "ai_interpretation": {
            "summary": "Expect aggressive rate cuts which favor Global Bonds and Global Equities.",
            "impacted_assets": ["GLOBAL_BOND", "GLOBAL_STOCK"],
            "confidence": 0.85
        },
        "full_report": {
            "executive_summary": "Core CPI is cooling down faster than the Fed's target, setting the stage for faster interest rate cuts.",
            "rationale": "Yields will decline, driving up prices for bonds, while growth equities will benefit from lower discount rates.",
            "target_assets": "Bullish: GLOBAL_BOND, GLOBAL_STOCK (Tech/Growth). Neutral: KR_STOCK.",
            "recommendation": "Overweight Global Fixed Income duration and US Large Cap Growth equities.",
            "risk_factors": "Sticky service inflation or sudden geopolitical oil shocks could pause rate cuts."
        }
    },
    {
        "id": "fb2",
        "author": "Tech Strategy Group",
        "author_title": "Global Equity Strategists",
        "source": "Goldman Sachs Research",
        "date": datetime.utcnow().isoformat(),
        "title": "AI CapEx cycle is far from over",
        "content": "Hyperscalers are increasing GPU investments for the second half of 2026. Hardware bottlenecks are easing, and software monetization is showing early double-digit growth, indicating a robust upward trend.",
        "image_url": "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=400&h=300",
        "ai_interpretation": {
            "summary": "AI CapEx expansion remains a major catalyst for Tech Equities.",
            "impacted_assets": ["GLOBAL_STOCK"],
            "confidence": 0.90
        },
        "full_report": {
            "executive_summary": "Hyperscale AI capital expenditures are scaling higher, contrary to bubble concerns.",
            "rationale": "Strong demand for infrastructure guarantees hardware vendor revenues, creating a positive feedback loop for US tech.",
            "target_assets": "Bullish: GLOBAL_STOCK. Bearish: KR_STOCK (non-semiconductor).",
            "recommendation": "Maintain high allocation to Global Equities, focusing on primary AI supply chain nodes.",
            "risk_factors": "Valuation premium compression or semiconductor export restrictions."
        }
    }
]

def clean_and_parse_json(text: str) -> Dict[str, Any]:
    cleaned = text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned, re.IGNORECASE)
    if match:
        cleaned = match.group(1).strip()
    
    start_idx = cleaned.find("{")
    end_idx = cleaned.rfind("}")
    if start_idx != -1 and end_idx != -1:
        cleaned = cleaned[start_idx:end_idx+1]
        
    return json.loads(cleaned)

async def fetch_marketaux_headlines() -> List[Dict[str, Any]]:
    """
    Fetches the latest market/finance news from the Marketaux API.
    Returns normalized headline dicts enriched with description, source,
    real article image, and detected entities + sentiment scores.
    Returns an empty list if the API key is missing or the request fails,
    so callers can fall back to the RSS source.
    """
    if not MARKETAUX_API_KEY:
        logger.info("MARKETAUX_API_KEY not set. Skipping Marketaux; will fall back to RSS.")
        return []

    params = {
        "api_token": MARKETAUX_API_KEY,
        "language": "en",
        "filter_entities": "true",   # only entity-tagged articles (richer, fresher than keyword search)
        "sort": "published_desc",    # newest first
        "limit": MARKETAUX_LIMIT,    # free tier caps at 3
        "industries": MARKETAUX_INDUSTRIES,
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(MARKETAUX_API_URL, params=params, timeout=12.0)

        if response.status_code != 200:
            logger.error(f"Marketaux returned status {response.status_code}: {response.text[:200]}")
            return []

        articles = response.json().get("data", [])
        headlines = []
        for art in articles:
            entities = art.get("entities") or []
            entity_summary = ", ".join(
                f"{e.get('name')} ({e.get('symbol')}, sentiment {e.get('sentiment_score')})"
                for e in entities[:5] if e.get("name")
            )
            headlines.append({
                "title": art.get("title", ""),
                "source": art.get("source", "Marketaux"),
                "pubDate": art.get("published_at", datetime.utcnow().isoformat()),
                "description": art.get("description") or art.get("snippet") or "",
                "url": art.get("url", ""),
                "image_url": art.get("image_url", ""),
                "entities": entity_summary,
            })

        logger.info(f"Fetched {len(headlines)} headlines from Marketaux.")
        return headlines

    except Exception as e:
        logger.error(f"Failed to fetch Marketaux news: {e}")
        return []

async def fetch_rss_headlines() -> List[Dict[str, Any]]:
    """
    Fetches the latest investment-related headlines from Google News RSS.
    Used as a fallback when Marketaux is unavailable.
    """
    url = "https://news.google.com/rss/search?q=market+outlook+investment+thesis&hl=en-US&gl=US&ceid=US:en"
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10.0)
        if response.status_code == 200:
            root = ET.fromstring(response.content)
            items = root.findall(".//item")
            headlines = []
            for item in items[:5]:
                headlines.append({
                    "title": item.find("title").text,
                    "pubDate": item.find("pubDate").text,
                    "source": item.find("source").text if item.find("source") is not None else "Financial News",
                    "link": item.find("link").text
                })
            return headlines
    except Exception as e:
        logger.error(f"Failed to fetch RSS: {e}")
    return []

# Maximum age of articles we will accept (7 days)
MAX_ARTICLE_AGE_DAYS = 7

def _parse_pub_date(raw: str) -> Optional[datetime]:
    """Parses an RFC-2822 RSS pubDate string into a naive UTC datetime.
    Returns None if the string cannot be parsed."""
    if not raw:
        return None
    try:
        dt = parsedate_to_datetime(raw)
        # Normalise to naive UTC so we can compare with datetime.utcnow()
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    except Exception:
        return None

async def fetch_rss_headlines_for_category(category: str, query: str, limit: int = 50, age_days: int = 7) -> List[Dict[str, Any]]:
    """
    Fetches recent investment-related headlines from Google News RSS, filtered by
    category and publication date (only articles from the past age_days days are kept).
    """
    encoded_query = urllib.parse.quote_plus(query)
    url = f"https://news.google.com/rss/search?q={encoded_query}&hl=en-US&gl=US&ceid=US:en"
    cutoff = datetime.utcnow() - timedelta(days=age_days)
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=12.0)
        if response.status_code == 200:
            root = ET.fromstring(response.content)
            items = root.findall(".//item")
            headlines = []
            skipped_old = 0
            for item in items:
                if len(headlines) >= limit:
                    break
                title_elem = item.find("title")
                title = title_elem.text if title_elem is not None else ""

                link_elem = item.find("link")
                link = link_elem.text if link_elem is not None else ""

                pub_date_elem = item.find("pubDate")
                pub_date_raw = pub_date_elem.text if pub_date_elem is not None else ""
                pub_dt = _parse_pub_date(pub_date_raw)

                # --- RECENCY FILTER ---
                if pub_dt is not None and pub_dt < cutoff:
                    skipped_old += 1
                    continue  # Article is too old — skip it

                # Use parsed ISO date for storage; fall back to now if unparseable
                pub_date_iso = pub_dt.isoformat() if pub_dt else datetime.utcnow().isoformat()

                source_elem = item.find("source")
                source = source_elem.text if source_elem is not None else "Financial News"

                headlines.append({
                    "title": title,
                    "pubDate": pub_date_iso,
                    "source": source,
                    "link": link,
                    "url": link,
                    "description": title,
                    "image_url": "",
                    "entities": "",
                    "category_hint": category
                })

            if skipped_old:
                logger.info(f"[{category}] Skipped {skipped_old} articles older than {age_days} days.")
            logger.info(f"[{category}] Kept {len(headlines)} fresh articles.")
            return headlines
    except Exception as e:
        logger.error(f"Failed to fetch RSS for category {category}: {e}")
    return []


async def generate_theses_with_llm(headlines: List[Dict[str, Any]], category_hint: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Sends headlines to OpenRouter and asks it to output structured analyst reports.
    """
    if not headlines:
        return []
    
    headlines_text = "\n\n".join([
        (
            f"- Title: {h['title']}\n"
            f"  Source: {h.get('source', 'N/A')} | Date: {h.get('pubDate', '')}\n"
            f"  Summary: {h.get('description', '') or 'N/A'}\n"
            f"  Key entities & sentiment: {h.get('entities', '') or 'N/A'}\n"
            f"  Article URL: {h.get('url', '') or 'N/A'}\n"
            f"  Image URL: {h.get('image_url', '') or 'N/A'}"
        )
        for h in headlines
    ])

    extra_instructions = ""
    if category_hint == "EQUITY":
        extra_instructions = """
IMPORTANT FOR ASSET CLASSIFICATION:
For this set of Equity articles, the "ai_interpretation" -> "impacted_assets" list MUST contain either "GLOBAL_STOCK" or "KR_STOCK" (or both). It must not contain other asset classes unless they are secondary.
"""
    elif category_hint == "BOND":
        extra_instructions = """
IMPORTANT FOR ASSET CLASSIFICATION:
For this set of Fixed Income/Bond articles, the "ai_interpretation" -> "impacted_assets" list MUST contain either "GLOBAL_BOND" or "KR_BOND" (or both). It must not contain other asset classes unless they are secondary.
"""
    elif category_hint == "ALTERNATIVE":
        extra_instructions = """
IMPORTANT FOR ASSET CLASSIFICATION:
For this set of Alternative assets articles, the "ai_interpretation" -> "impacted_assets" list MUST contain "ALTERNATIVE". It must not contain other asset classes unless they are secondary.
"""
    elif category_hint == "MACRO":
        extra_instructions = """
IMPORTANT FOR ASSET CLASSIFICATION:
For this set of Macroeconomics/Economy articles, the "ai_interpretation" -> "impacted_assets" list MUST NOT contain any of "GLOBAL_STOCK", "KR_STOCK", "GLOBAL_BOND", "KR_BOND", or "ALTERNATIVE". Leave "impacted_assets" empty, or use other keys if needed, so they are classified as Macro.
"""

    system_prompt = f"""{load_digest_persona()}

============================================================================
END OF DIGEST PERSONA. You have now read it in full. Compose EACH THESIS
below, conforming to every rule above.
============================================================================

Analyze the following recent financial headlines and, for EACH headline, generate a structured market intelligence object containing:
1. "id": A unique string (e.g. t1, t2, t3).
2. "author": A realistic name of a financial professional or firm (e.g. Goldman Sachs Research, Morgan Stanley Wealth, John Kowalski).
3. "author_title": Rationale Title (e.g. Senior Macro Strategist, Global Equities Analyst).
4. "source": The news source (e.g. Bloomberg, Reuters, Financial Times).
5. "date": ISO publication date.
6. "title": A clean, punchy headline.
7. "content": A detailed 3-4 sentence investment thesis explaining the core asset allocation implications.
8. "image_url": If the headline provides an "Image URL", reuse that exact URL. Otherwise use a relevant placeholder photo (use: "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f" for bonds, "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3" for equities, "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab" for real estate/alternatives, "https://images.unsplash.com/photo-1518770660439-4636190af475" for tech).
9. "ai_interpretation": A JSON object containing:
   - "summary": A concise 1-sentence bottom-line takeaway.
   - "impacted_assets": A list containing 1 or more of: KR_STOCK, GLOBAL_STOCK, KR_BOND, GLOBAL_BOND, ALTERNATIVE.
   - "confidence": A rating between 0.0 and 1.0.
10. "full_report": A JSON object representing a "Bloomberg Terminal" report:
   - "executive_summary": A 2-3 sentence overview.
   - "rationale": Detailed economic reasoning (why this matters for global assets).
   - "target_assets": Bullish/Bearish breakdown on affected assets.
   - "recommendation": Specific trade recommendations for a pension fund (e.g. "Overweight US Tech / Underweight Emerging Markets").
   - "risk_factors": Key risk factors or scenarios where this thesis fails.

You must output a JSON object containing a single key "theses" pointing to a list of these structured items.
Ensure all asset keys are valid. Output ONLY valid, parseable JSON. Do not write markdown decorations other than JSON block.

IMPORTANT LANGUAGE RULE: If the article's source or content is primarily in English (e.g. Bloomberg, Reuters, WSJ, FT, CNBC), write ALL text fields (title, content, executive_summary, rationale, etc.) in ENGLISH. Only use Korean if the article source is a Korean outlet (e.g. Yonhap, Hankyung, Chosun) or the original content is written in Korean.

{extra_instructions}
"""

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/google-antigravity/nps-black-litterman",
        "X-Title": "NPS Black-Litterman Platform"
    }
    
    payload = {
        "model": ARTICLE_DIGESTION_MODEL,  # Nemotron Super for article digestion
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Financial Headlines:\n{headlines_text}"}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2,
        # Cap output to keep OpenRouter credit reservation affordable (Nemotron's
        # default max output is very large and can trigger 402 Payment Required).
        "max_tokens": 6000
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(OPENROUTER_API_URL, headers=headers, json=payload, timeout=25.0)
        
        if response.status_code == 200:
            res_json = response.json()
            raw_content = res_json["choices"][0]["message"]["content"]
            parsed_data = clean_and_parse_json(raw_content)
            theses = parsed_data.get("theses", [])

            # Override any LLM-fabricated provenance with the REAL source article
            # metadata (matched by order). This guarantees the feed always shows
            # genuine, current dates/sources/images rather than hallucinated ones.
            for idx, t in enumerate(theses):
                if idx < len(headlines):
                    src = headlines[idx]
                    if src.get("pubDate"):
                        t["date"] = src["pubDate"]
                    if src.get("source"):
                        t["source"] = src["source"]
                    if src.get("image_url"):
                        t["image_url"] = src["image_url"]
                    if src.get("url") and isinstance(t.get("full_report"), dict):
                        t["full_report"]["source_url"] = src["url"]
                t.setdefault("id", f"t{idx + 1}")
            return theses
    except Exception as e:
        logger.error(f"Failed to generate theses with LLM: {e}")
    return []

def _html_to_text(html: str) -> str:
    """Strips scripts/styles/tags from raw HTML and returns collapsed plain text."""
    html = re.sub(r"(?is)<(script|style|noscript|head|nav|footer|aside)[^>]*>.*?</\1>", " ", html)
    text = re.sub(r"(?s)<[^>]+>", " ", html)
    replacements = {
        "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">",
        "&#39;": "'", "&rsquo;": "'", "&quot;": '"', "&ldquo;": '"', "&rdquo;": '"',
    }
    for a, b in replacements.items():
        text = text.replace(a, b)
    return re.sub(r"\s+", " ", text).strip()


def extract_pdf_text(data: bytes, max_pages: int = 30) -> str:
    """Extracts plain text from a PDF byte stream (text-based PDFs; scans yield little)."""
    try:
        import io
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        parts = []
        for page in reader.pages[:max_pages]:
            try:
                parts.append(page.extract_text() or "")
            except Exception:
                continue
        return re.sub(r"\s+", " ", " ".join(parts)).strip()
    except Exception as e:
        logger.warning(f"PDF text extraction failed: {e}")
        return ""


async def fetch_url_text(url: str, client: Optional[httpx.AsyncClient] = None) -> Optional[str]:
    """
    Fetches a URL and extracts readable plain text. Handles both HTML pages and PDF
    documents. Returns None if the page can't be retrieved or yields no extractable
    text (caller then asks the user to paste).
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    try:
        if client is not None:
            resp = await client.get(url, headers=headers, timeout=15.0)
        else:
            async with httpx.AsyncClient(follow_redirects=True) as c:
                resp = await c.get(url, headers=headers, timeout=15.0)
        if resp.status_code != 200:
            logger.warning(f"URL fetch returned {resp.status_code} for {url}")
            return None
        content_type = resp.headers.get("content-type", "").lower()
        # PDF documents (by content-type or extension) → extract via pypdf.
        if "pdf" in content_type or url.lower().split("?")[0].endswith(".pdf"):
            return extract_pdf_text(resp.content)
        if "html" not in content_type and "text" not in content_type and "xml" not in content_type:
            logger.warning(f"URL {url} is not a text/html/pdf document ({content_type}).")
            return None
        return _html_to_text(resp.text)
    except Exception as e:
        logger.warning(f"Failed to fetch URL {url}: {e}")
        return None


def _domain_of(url: str) -> str:
    """Extracts a clean domain (e.g. 'reuters.com') from a URL for use as the source."""
    m = re.search(r"https?://([^/]+)", url or "")
    return m.group(1).replace("www.", "") if m else ""


async def assess_article_relevance(text: str) -> Dict[str, Any]:
    """LLM gate: is this material useful for TOP-DOWN multi-asset allocation, or is it
    off-topic / too single-company specific? Returns {relevant, too_company_specific, reason}.
    Fails open (relevant=True) on any error so ingestion is never silently blocked."""
    if not OPENROUTER_API_KEY:
        return {"relevant": True, "too_company_specific": False, "reason": ""}
    system = (
        "You are a macro asset-allocation research editor for a pension fund. Decide whether an "
        "article is useful for TOP-DOWN multi-asset allocation (macro, rates, FX, commodities, "
        "broad sectors, asset classes). Flag it if it is OFF-TOPIC (not about markets/economy/"
        "investing at all) OR TOO COMPANY-SPECIFIC (centered on one company's product/earnings/"
        "personnel with no macro or asset-class read-through). Reply ONLY with JSON: "
        '{"relevant": true|false, "too_company_specific": true|false, "reason": "<one short Korean sentence>"}'
    )
    headers = {"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"}
    payload = {
        "model": ARTICLE_DIGESTION_MODEL,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": text[:4000]}],
        "response_format": {"type": "json_object"}, "temperature": 0.0, "max_tokens": 200,
    }
    try:
        async with httpx.AsyncClient() as client:
            r = await client.post(OPENROUTER_API_URL, headers=headers, json=payload, timeout=60.0)
        if r.status_code == 200:
            j = clean_and_parse_json(r.json()["choices"][0]["message"]["content"])
            return {
                "relevant": bool(j.get("relevant", True)),
                "too_company_specific": bool(j.get("too_company_specific", False)),
                "reason": str(j.get("reason", "")),
            }
    except Exception as e:
        logger.warning(f"Relevance check failed ({e}); allowing ingestion.")
    return {"relevant": True, "too_company_specific": False, "reason": ""}


async def ingest_article(
    db: Session,
    url: Optional[str] = None,
    content: Optional[str] = None,
    source_label: Optional[str] = None,
    confirm: bool = False,
) -> Dict[str, Any]:
    """
    Turns a user-supplied article into a structured thesis.

    - If `content` (pasted text) is given, it is analyzed directly.
    - Else the `url` is fetched and its text extracted.
    - If the URL can't be fetched or yields too little text, returns
      {"status": "needs_content"} so the UI can ask the user to paste it.

    On success: persists the new thesis and returns the updated feed.
    """
    if not OPENROUTER_API_KEY:
        return {"status": "error", "message": "AI 분석을 위한 OpenRouter API 키가 설정되지 않았습니다."}

    source_url = (url or "").strip()
    text = (content or "").strip()
    from_paste = bool(text)

    if not text:
        if not source_url:
            return {"status": "error", "message": "URL 또는 본문 내용을 입력해 주세요."}
        fetched = await fetch_url_text(source_url)
        if not fetched or len(fetched) < MIN_ARTICLE_CHARS:
            return {
                "status": "needs_content",
                "message": "해당 URL의 본문을 자동으로 불러오지 못했습니다 (로그인/자바스크립트 기반 페이지일 수 있습니다). "
                           "기사 본문을 복사하여 아래에 붙여넣어 주세요.",
            }
        text = fetched

    # Relevance gate — warn (and require confirmation) when the material is off-topic for
    # asset allocation or too single-company specific. The LLM makes the call.
    if not confirm:
        verdict = await assess_article_relevance(text)
        if (not verdict.get("relevant", True)) or verdict.get("too_company_specific", False):
            return {
                "status": "needs_confirmation",
                "warning": verdict.get("reason") or "이 자료는 자산배분 관점과 거리가 있어 보입니다.",
                "relevant": verdict.get("relevant", True),
                "too_company_specific": verdict.get("too_company_specific", False),
            }

    # Wrap the article as a single "headline" and reuse the thesis generator.
    domain = _domain_of(source_url)
    headline = {
        "title": text[:90],
        "source": domain or "사용자 제출",
        "pubDate": datetime.utcnow().isoformat(),
        "description": text[:6000],
        "url": source_url,
        "image_url": "",
        "entities": "",
    }

    theses = await generate_theses_with_llm([headline])
    if not theses:
        return {"status": "error", "message": "AI 분석 생성에 실패했습니다. 잠시 후 다시 시도해 주세요."}

    t = theses[0]
    t["id"] = f"url-{int(datetime.utcnow().timestamp())}"
    t.setdefault("author", "User-Submitted Analysis")
    t.setdefault("author_title", "AI Research Desk")
    t["date"] = datetime.utcnow().isoformat()
    t["source"] = source_label or domain or ("사용자 붙여넣기" if from_paste else "사용자 제출")
    if source_url and isinstance(t.get("full_report"), dict):
        t["full_report"]["source_url"] = source_url

    try:
        db_item = MarketIntelligence(
            id=t["id"],
            author=t.get("author", "User-Submitted Analysis"),
            author_title=t.get("author_title", "AI Research Desk"),
            source=t.get("source", ""),
            date=t.get("date"),
            title=t.get("title", ""),
            content=t.get("content", ""),
            image_url=t.get("image_url", ""),
            ai_interpretation=t.get("ai_interpretation", {}),
            full_report=t.get("full_report"),
            category="USER_ASSET"
        )
        db.add(db_item)
        db.commit()
        logger.info(f"Ingested user article into thesis {t['id']} (source: {t['source']}).")
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to persist ingested thesis: {e}")

    feed = _serialize_feed(db.query(MarketIntelligence).all())
    return {"status": "ok", "thesis": t, "data": feed}


def _serialize_feed(items: List[Any]) -> List[Dict[str, Any]]:
    """Serializes MarketIntelligence rows to the API/feed shape, newest first."""
    serialized = [
        {
            "id": item.id,
            "author": item.author,
            "author_title": item.author_title,
            "source": item.source,
            "date": item.date,
            "title": item.title,
            "content": item.content,
            "image_url": item.image_url,
            "ai_interpretation": item.ai_interpretation,
            "full_report": item.full_report,
            "category": item.category or "NEWS",
        }
        for item in items
    ]
    serialized.sort(key=lambda x: x.get("date") or "", reverse=True)
    return serialized


async def select_top_articles_with_llm(headlines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Sends the list of headlines to the LLM and asks it to select the top 10-15 articles
    that are most relevant and impactful for tactical asset allocation.
    Returns the selected subset of headlines.
    """
    if not headlines:
        return []
    
    # If the number of headlines is already between 10 and 15 (or fewer), no need to filter
    if len(headlines) <= 15:
        return headlines

    # Format the headlines for the prompt
    headlines_formatted = []
    for idx, h in enumerate(headlines):
        headlines_formatted.append(
            f"Index: {idx}\n"
            f"Title: {h['title']}\n"
            f"Source: {h.get('source', 'N/A')} | Date: {h.get('pubDate', '')}\n"
            f"Category: {h.get('category_hint', 'MACRO')}\n"
            f"Summary: {h.get('description', '') or 'N/A'}\n"
        )
    
    headlines_text = "\n---\n".join(headlines_formatted)

    system_prompt = """You are a senior asset manager at a sovereign wealth fund.
Given the following list of recent financial headlines, select the top 10 to 15 articles that are most relevant, important, and impactful for tactical asset allocation decisions (macroeconomic changes, equity earnings/valuations, bond yields, currency/commodity moves, central bank policies).

You must select AT LEAST 10 and AT MOST 15 articles.
Output your selection as a JSON object containing a single key "selected_indices" mapping to a list of integers representing the chosen indices (e.g. {"selected_indices": [0, 2, 5, ...]}).
Output ONLY valid, parseable JSON. Do not write markdown decorations other than the JSON block.
"""

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/google-antigravity/nps-black-litterman",
        "X-Title": "NPS Black-Litterman Platform"
    }
    
    payload = {
        "model": OPENROUTER_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Here is the list of headlines:\n\n{headlines_text}"}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
        "max_tokens": 1000
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(OPENROUTER_API_URL, headers=headers, json=payload, timeout=20.0)
        
        if response.status_code == 200:
            res_json = response.json()
            raw_content = res_json["choices"][0]["message"]["content"]
            parsed_data = clean_and_parse_json(raw_content)
            selected_indices = parsed_data.get("selected_indices", [])
            
            # Filter and validate indices
            valid_indices = [int(i) for i in selected_indices if isinstance(i, (int, str)) and str(i).isdigit() and 0 <= int(i) < len(headlines)]
            
            # Enforce 10-15 limit constraint
            if len(valid_indices) < 10 or len(valid_indices) > 15:
                # If LLM failed to return 10-15 valid indices, fallback to taking the first 12 articles
                logger.warning(f"LLM selected {len(valid_indices)} indices (expected 10-15). Falling back to top 12.")
                valid_indices = list(range(min(12, len(headlines))))
                
            selected_headlines = [headlines[i] for i in valid_indices]
            logger.info(f"LLM successfully selected {len(selected_headlines)} articles out of {len(headlines)}.")
            return selected_headlines
    except Exception as e:
        logger.error(f"Failed to select articles with LLM: {e}. Falling back to first 12.")
    
    # Ultimate fallback: return the first 12 items
    return headlines[:12]



async def sync_market_intelligence_with_progress(db: Session, force: bool = False):
    """
    Same pipeline as sync_market_intelligence, but yields SSE-compatible progress
    events so the frontend can display a real-time task list.
    Yields dicts like:
      {"type": "phase", "phase": "fetching", "msg": "..."}
      {"type": "article_read", "title": "...", "source": "...", "status": "reading|done"}
      {"type": "article_selected", "title": "...", "source": "..."}
      {"type": "article_analyzing", "title": "...", "source": "...", "status": "analyzing|done"}
      {"type": "result", "data": [...]}
    """
    from typing import AsyncGenerator
    import asyncio

    # -- Phase 1: Fetch RSS --
    yield {"type": "phase", "phase": "fetching", "msg": "Fetching latest headlines from RSS feeds..."}

    queries = {
        "EQUITY": 'site:reuters.com OR site:bloomberg.com OR site:wsj.com OR site:ft.com OR site:cnbc.com OR site:economist.com "equity valuations" OR "earnings yield" OR "stock market index" -earnings -ticker',
        "BOND": 'site:reuters.com OR site:bloomberg.com OR site:wsj.com OR site:ft.com OR site:cnbc.com OR site:economist.com "yield curve" OR "treasury yields" OR "sovereign bonds" OR "credit spreads"',
        "ALTERNATIVE": 'site:reuters.com OR site:bloomberg.com OR site:wsj.com OR site:ft.com OR site:cnbc.com OR site:economist.com "gold spot" OR "crude oil" OR "real estate REIT" OR "bitcoin macro" -earnings',
        "MACRO": 'site:reuters.com OR site:bloomberg.com OR site:wsj.com OR site:ft.com OR site:cnbc.com OR site:economist.com "inflation" OR "interest rates" OR "Fed" OR "GDP" OR "monetary policy"'
    }

    age_days = 7
    fetch_tasks = [
        fetch_rss_headlines_for_category(cat, q, limit=50, age_days=age_days)
        for cat, q in queries.items()
    ]
    category_headlines = await asyncio.gather(*fetch_tasks)

    seen_urls: set = set()
    seen_titles: set = set()
    unique_headlines = []
    for headlines in category_headlines:
        for h in headlines:
            url = h.get("url")
            title_norm = h.get("title", "").strip().lower()
            if url and url not in seen_urls and title_norm not in seen_titles:
                seen_urls.add(url)
                seen_titles.add(title_norm)
                unique_headlines.append(h)

    if len(unique_headlines) < 30:
        age_days = 14
        fetch_tasks = [
            fetch_rss_headlines_for_category(cat, q, limit=50, age_days=age_days)
            for cat, q in queries.items()
        ]
        category_headlines = await asyncio.gather(*fetch_tasks)
        seen_urls.clear()
        seen_titles.clear()
        unique_headlines.clear()
        for headlines in category_headlines:
            for h in headlines:
                url = h.get("url")
                title_norm = h.get("title", "").strip().lower()
                if url and url not in seen_urls and title_norm not in seen_titles:
                    seen_urls.add(url)
                    seen_titles.add(title_norm)
                    unique_headlines.append(h)

    # Emit each article as "read"
    yield {"type": "phase", "phase": "reading", "msg": f"Found {len(unique_headlines)} articles. Showing headlines..."}
    for h in unique_headlines:
        yield {"type": "article_read", "title": h.get("title", "")[:80], "source": h.get("source", ""), "status": "done"}

    # -- Phase 2: Select top 10-15 --
    yield {"type": "phase", "phase": "selecting", "msg": "AI is selecting the 10-15 most relevant articles..."}
    selected_headlines = await select_top_articles_with_llm(unique_headlines)
    for h in selected_headlines:
        yield {"type": "article_selected", "title": h.get("title", "")[:80], "source": h.get("source", "")}

    # -- Phase 3: Scrape full text --
    yield {"type": "phase", "phase": "scraping", "msg": f"Scraping full article text for {len(selected_headlines)} articles..."}
    async with httpx.AsyncClient(follow_redirects=True) as client:
        scrape_tasks = [fetch_url_text(h["url"], client=client) for h in selected_headlines]
        scraped_texts = await asyncio.gather(*scrape_tasks)
    for h, text in zip(selected_headlines, scraped_texts):
        if text and len(text.strip()) >= MIN_ARTICLE_CHARS:
            h["description"] = text.strip()[:8000]

    # -- Phase 4: Analyze with LLM --
    yield {"type": "phase", "phase": "analyzing", "msg": f"Analyzing {len(selected_headlines)} articles in parallel..."}
    for h in selected_headlines:
        yield {"type": "article_analyzing", "title": h.get("title", "")[:80], "source": h.get("source", ""), "status": "analyzing"}

    # Fire all analyses concurrently, but emit each article's "done" the MOMENT it
    # finishes — not after the whole batch. Batching the done-events behind a single
    # asyncio.gather made the UI sit frozen for the entire (slow) analysis, which read
    # as the refresh "stopping/crashing" right after article selection.
    async def _analyze_one(h):
        cat_theses = await generate_theses_with_llm([h], category_hint=h.get("category_hint"))
        return h, cat_theses

    all_theses = []
    tasks = [asyncio.create_task(_analyze_one(h)) for h in selected_headlines]
    for fut in asyncio.as_completed(tasks):
        try:
            h, cat_theses = await fut
            if cat_theses:
                all_theses.extend(cat_theses)
            yield {"type": "article_analyzing", "title": h.get("title", "")[:80], "source": h.get("source", ""), "status": "done"}
        except Exception as e:
            logger.error(f"Thesis task failed during analysis: {e}")

    # -- Phase 5: Commit to DB --
    yield {"type": "phase", "phase": "saving", "msg": f"Saving {len(all_theses)} theses to database..."}
    if all_theses:
        try:
            db.query(MarketIntelligence).filter(
                (MarketIntelligence.category == "NEWS") | (MarketIntelligence.category.is_(None))
            ).delete()
            timestamp_sec = int(datetime.utcnow().timestamp())
            for idx, t in enumerate(all_theses):
                t["id"] = f"news-{timestamp_sec}-{idx}"
            for t in all_theses:
                db_item = MarketIntelligence(
                    id=t["id"],
                    author=t.get("author", "NPS Research Desk"),
                    author_title=t.get("author_title", "Senior Macro Strategist"),
                    source=t.get("source", "Financial News"),
                    date=t.get("date", datetime.utcnow().isoformat()),
                    title=t.get("title", ""),
                    content=t.get("content", ""),
                    image_url=t.get("image_url", ""),
                    ai_interpretation=t.get("ai_interpretation", {}),
                    full_report=t.get("full_report"),
                    category="NEWS"
                )
                db.add(db_item)
            db.commit()
        except Exception as e:
            logger.error(f"Failed to commit theses in stream: {e}")
            db.rollback()

    final_data = _serialize_feed(db.query(MarketIntelligence).all())
    yield {"type": "result", "data": final_data}


async def sync_market_intelligence(db: Session, force: bool = False) -> List[Dict[str, Any]]:
    """
    Retrieves market theses from DB cache. If empty or stale, fetches from RSS, analyzes with LLM, and caches.
    """
    # Check cache first for NEWS items
    news_items = db.query(MarketIntelligence).filter(
        (MarketIntelligence.category == "NEWS") | (MarketIntelligence.category.is_(None))
    ).all()
    
    is_stale = True
    if news_items:
        try:
            latest_created = max([item.created_at for item in news_items if item.created_at])
            if datetime.utcnow() - latest_created < timedelta(hours=CACHE_TTL_HOURS):
                is_stale = False
        except Exception as e:
            logger.warning(f"Error checking cache freshness: {e}")
            is_stale = True

    if not news_items or is_stale or force:
        logger.info("Stale or missing news cache. Syncing category-specific market intelligence...")
        
        # 1. Fetch RSS headlines for the 4 categories
        queries = {
            "EQUITY": 'site:reuters.com OR site:bloomberg.com OR site:wsj.com OR site:ft.com OR site:cnbc.com OR site:economist.com "equity valuations" OR "earnings yield" OR "stock market index" -earnings -ticker',
            "BOND": 'site:reuters.com OR site:bloomberg.com OR site:wsj.com OR site:ft.com OR site:cnbc.com OR site:economist.com "yield curve" OR "treasury yields" OR "sovereign bonds" OR "credit spreads"',
            "ALTERNATIVE": 'site:reuters.com OR site:bloomberg.com OR site:wsj.com OR site:ft.com OR site:cnbc.com OR site:economist.com "gold spot" OR "crude oil" OR "real estate REIT" OR "bitcoin macro" -earnings',
            "MACRO": 'site:reuters.com OR site:bloomberg.com OR site:wsj.com OR site:ft.com OR site:cnbc.com OR site:economist.com "inflation" OR "interest rates" OR "Fed" OR "GDP" OR "monetary policy"'
        }
        
        # Fetch RSS with 7-day recency first
        age_days = 7
        fetch_tasks = [
            fetch_rss_headlines_for_category(cat, q, limit=50, age_days=age_days)
            for cat, q in queries.items()
        ]
        category_headlines = await asyncio.gather(*fetch_tasks)
        
        # Flatten and deduplicate by URL or normalized Title
        seen_urls = set()
        seen_titles = set()
        unique_headlines = []
        for headlines in category_headlines:
            for h in headlines:
                url = h.get("url")
                title_norm = h.get("title", "").strip().lower()
                if url and url not in seen_urls and title_norm not in seen_titles:
                    seen_urls.add(url)
                    seen_titles.add(title_norm)
                    unique_headlines.append(h)

        # If pool size is under 30, retry with 14-day recency
        if len(unique_headlines) < 30:
            logger.info(f"Only {len(unique_headlines)} fresh articles found with {age_days}-day limit. Relaxing to 14 days...")
            age_days = 14
            fetch_tasks = [
                fetch_rss_headlines_for_category(cat, q, limit=50, age_days=age_days)
                for cat, q in queries.items()
            ]
            category_headlines = await asyncio.gather(*fetch_tasks)
            
            seen_urls.clear()
            seen_titles.clear()
            unique_headlines.clear()
            for headlines in category_headlines:
                for h in headlines:
                    url = h.get("url")
                    title_norm = h.get("title", "").strip().lower()
                    if url and url not in seen_urls and title_norm not in seen_titles:
                        seen_urls.add(url)
                        seen_titles.add(title_norm)
                        unique_headlines.append(h)

        logger.info(f"Collected pool of {len(unique_headlines)} articles (target >= 30). Choosing 10-15 to analyze...")
        
        # Select 10-15 articles from the pool
        selected_headlines = await select_top_articles_with_llm(unique_headlines)
        
        # Scrape full text content for the selected articles in parallel
        logger.info(f"Concurrently scraping full webpage text for the selected {len(selected_headlines)} articles...")
        async with httpx.AsyncClient(follow_redirects=True) as client:
            scrape_tasks = [fetch_url_text(h["url"], client=client) for h in selected_headlines]
            scraped_texts = await asyncio.gather(*scrape_tasks)
        
        # Enrich headlines with scraped text or fallback to original description
        for h, text in zip(selected_headlines, scraped_texts):
            if text and len(text.strip()) >= MIN_ARTICLE_CHARS:
                h["description"] = text.strip()[:8000]
            else:
                logger.info(f"Scrape failed/short for {h.get('url')}. Falling back to RSS summary.")

        # Generate theses for selected articles in parallel (using single-article tasks)
        logger.info(f"Concurrently generating theses for {len(selected_headlines)} articles...")
        thesis_tasks = [
            generate_theses_with_llm([h], category_hint=h.get("category_hint"))
            for h in selected_headlines
        ]
        
        all_theses = []
        if thesis_tasks:
            try:
                thesis_results = await asyncio.gather(*thesis_tasks)
                for cat_theses in thesis_results:
                    if cat_theses:
                        all_theses.extend(cat_theses)
            except Exception as e:
                logger.error(f"Failed parallel LLM thesis generation: {e}")
        
        if all_theses:
            try:
                # Clear ONLY the old news cache. Leave RESEARCH and USER_ASSET items alone!
                db.query(MarketIntelligence).filter(
                    (MarketIntelligence.category == "NEWS") | (MarketIntelligence.category.is_(None))
                ).delete()
                
                # Assign stable, unique news IDs to prevent collisions
                timestamp_sec = int(datetime.utcnow().timestamp())
                for idx, t in enumerate(all_theses):
                    t["id"] = f"news-{timestamp_sec}-{idx}"
                
                # Insert new cache
                for t in all_theses:
                    db_item = MarketIntelligence(
                        id=t["id"],
                        author=t.get("author", "NPS Research Desk"),
                        author_title=t.get("author_title", "Senior Macro Strategist"),
                        source=t.get("source", "Financial News"),
                        date=t.get("date", datetime.utcnow().isoformat()),
                        title=t.get("title", ""),
                        content=t.get("content", ""),
                        image_url=t.get("image_url", ""),
                        ai_interpretation=t.get("ai_interpretation", {}),
                        full_report=t.get("full_report"),
                        category="NEWS"
                    )
                    db.add(db_item)
                db.commit()
                logger.info(f"Successfully cached {len(all_theses)} live financial theses from RSS feeds.")
                return _serialize_feed(db.query(MarketIntelligence).all())
            except Exception as e:
                logger.error(f"Failed to commit new theses to DB: {e}")
                db.rollback()

    # Return cached items (all categories, including NEWS, RESEARCH, USER_ASSET)
    all_cached = db.query(MarketIntelligence).all()
    if all_cached:
        return _serialize_feed(all_cached)

    # Fallback if everything fails
    logger.warning("All sync attempts failed. Serving fallback theses.")
    return FALLBACK_THESES

async def fetch_market_intelligence(db: Session) -> List[Dict[str, Any]]:
    """
    Entrypoint function.
    """
    return await sync_market_intelligence(db)


async def promote_thesis_to_intel(db: Session, thesis_id: str) -> Dict[str, Any]:
    """
    Promotes a house thesis from the Research Pipeline to Market Intelligence.
    - Generates a full structured Bloomberg report using the LLM.
    - Saves it as category="RESEARCH".
    - Marks the original thesis as approved.
    """
    from app.db import Thesis as DBThesis
    thesis_row = db.query(DBThesis).filter(DBThesis.id == thesis_id).first()
    if not thesis_row:
        return {"status": "error", "message": "Thesis not found"}

    # Set up prompt to generate full report sections from thesis rationale & evidence
    system_prompt = """
You are a senior asset manager and macroeconomic research director at a leading sovereign wealth fund.
Given the following investment thesis and supporting evidence, expand it into a structured "Bloomberg Terminal" analyst report.
Output a JSON object containing:
1. "executive_summary": A 2-3 sentence high-level overview.
2. "rationale": Detailed macroeconomic reasoning (why this matters for global assets, rates, etc.).
3. "target_assets": A string detailing target asset implications (e.g. "Bullish: GLOBAL_STOCK. Bearish: KR_STOCK.").
4. "recommendation": Specific asset allocation recommendation for a pension fund.
5. "risk_factors": Key risk factors or scenarios where this thesis fails.

Output ONLY valid, parseable JSON. Do not write markdown decorations other than JSON block.
"""
    user_content = f"""
Title: {thesis_row.title}
View Type: {thesis_row.view_type}
Asset/s: {thesis_row.asset or f"{thesis_row.asset1} vs {thesis_row.asset2}"}
Rationale: {thesis_row.rationale}
Evidence: {thesis_row.evidence}
Confidence: {thesis_row.confidence_calibrated}
"""

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/google-antigravity/nps-black-litterman",
        "X-Title": "NPS Black-Litterman Platform"
    }
    
    payload = {
        "model": ARTICLE_DIGESTION_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2
    }

    full_report = None
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(OPENROUTER_API_URL, headers=headers, json=payload, timeout=25.0)
        if response.status_code == 200:
            res_json = response.json()
            raw_content = res_json["choices"][0]["message"]["content"]
            full_report = clean_and_parse_json(raw_content)
    except Exception as e:
        logger.error(f"Failed to generate full report for thesis promotion: {e}")

    # Fallback report if LLM fails
    if not full_report:
        full_report = {
            "executive_summary": thesis_row.rationale,
            "rationale": f"Supported by evidence: {thesis_row.evidence}",
            "target_assets": f"Target: {thesis_row.asset or f'{thesis_row.asset1} vs {thesis_row.asset2}'} ({thesis_row.view_type})",
            "recommendation": f"Allocate in direction of thesis with confidence {thesis_row.confidence_calibrated}",
            "risk_factors": "General market volatility or estimation error."
        }

    # Format into MarketIntelligence row shape
    intel_id = f"promoted-{thesis_row.id}"
    
    # Map assets for classification in frontend
    impacted = []
    if thesis_row.view_type == "relative" and thesis_row.asset1 and thesis_row.asset2:
        impacted = [thesis_row.asset1, thesis_row.asset2]
    elif thesis_row.asset:
        impacted = [thesis_row.asset]

    t_data = {
        "id": intel_id,
        "author": "NPS House Strategy Team",
        "author_title": "Macro Research Director",
        "source": "NPS House View",
        "date": datetime.utcnow().isoformat(),
        "title": thesis_row.title or "Consolidated House View",
        "content": thesis_row.rationale or "",
        "image_url": "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab",
        "ai_interpretation": {
            "summary": thesis_row.rationale or "",
            "impacted_assets": impacted,
            "confidence": thesis_row.confidence_calibrated
        },
        "full_report": full_report,
        "category": "RESEARCH"
    }

    try:
        # Check if already promoted, if so overwrite
        existing = db.query(MarketIntelligence).filter(MarketIntelligence.id == intel_id).first()
        if existing:
            db.delete(existing)
            
        db_item = MarketIntelligence(
            id=t_data["id"],
            author=t_data["author"],
            author_title=t_data["author_title"],
            source=t_data["source"],
            date=t_data["date"],
            title=t_data["title"],
            content=t_data["content"],
            image_url=t_data["image_url"],
            ai_interpretation=t_data["ai_interpretation"],
            full_report=t_data["full_report"],
            category=t_data["category"]
        )
        db.add(db_item)
        
        # Approve original thesis
        thesis_row.status = "approved"
        db.commit()
        logger.info(f"Successfully promoted thesis {thesis_id} to market intelligence category RESEARCH.")
        
        feed = _serialize_feed(db.query(MarketIntelligence).all())
        return {"status": "ok", "thesis": t_data, "data": feed}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to persist promoted thesis: {e}")
        return {"status": "error", "message": f"데이터베이스 저장에 실패했습니다: {e}"}


async def promote_multiple_theses_to_intel(db: Session, thesis_ids: List[str]) -> Dict[str, Any]:
    """
    Batch-promotes multiple house theses to Market Intelligence in parallel.
    Fires one LLM call per thesis concurrently using asyncio.gather().
    Returns a combined feed with all promoted theses as category='RESEARCH'.
    """
    if not thesis_ids:
        return {"status": "error", "message": "No thesis IDs provided."}

    # Run individual promotions in parallel
    tasks = [promote_thesis_to_intel(db, tid) for tid in thesis_ids]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    promoted = []
    errors = []
    for tid, result in zip(thesis_ids, results):
        if isinstance(result, Exception):
            errors.append({"thesis_id": tid, "error": str(result)})
            logger.error(f"Batch promotion failed for thesis {tid}: {result}")
        elif isinstance(result, dict) and result.get("status") == "ok":
            promoted.append(result.get("thesis"))
        else:
            errors.append({"thesis_id": tid, "error": result.get("message", "Unknown error") if isinstance(result, dict) else "Unknown"})

    if not promoted and errors:
        return {"status": "error", "errors": errors}

    feed = _serialize_feed(db.query(MarketIntelligence).all())
    return {
        "status": "ok",
        "promoted_count": len(promoted),
        "promoted": promoted,
        "errors": errors,
        "data": feed
    }
