import logging
import httpx
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
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

logger = logging.getLogger(__name__)

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

async def generate_theses_with_llm(headlines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
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

    system_prompt = """
You are a senior asset manager and macroeconomic research director at a leading sovereign wealth fund.
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
"""

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/google-antigravity/nps-black-litterman",
        "X-Title": "NPS Black-Litterman Platform"
    }
    
    payload = {
        "model": ARTICLE_DIGESTION_MODEL,  # Nemotron Ultra for article digestion
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


async def fetch_url_text(url: str) -> Optional[str]:
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
        async with httpx.AsyncClient(follow_redirects=True) as client:
            resp = await client.get(url, headers=headers, timeout=15.0)
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


async def ingest_article(
    db: Session,
    url: Optional[str] = None,
    content: Optional[str] = None,
    source_label: Optional[str] = None,
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
        }
        for item in items
    ]
    serialized.sort(key=lambda x: x.get("date") or "", reverse=True)
    return serialized


async def sync_market_intelligence(db: Session, force: bool = False) -> List[Dict[str, Any]]:
    """
    Retrieves market theses from DB cache. If empty or stale, fetches from RSS, analyzes with LLM, and caches.
    """
    # Check cache first
    cached_items = db.query(MarketIntelligence).all()
    
    is_stale = True
    if cached_items:
        try:
            latest_created = max([item.created_at for item in cached_items if item.created_at])
            if datetime.utcnow() - latest_created < timedelta(hours=CACHE_TTL_HOURS):
                is_stale = False
        except Exception as e:
            logger.warning(f"Error checking cache freshness: {e}")
            is_stale = True

    if not cached_items or is_stale or force:
        logger.info("Stale or missing cache. Syncing market intelligence...")
        headlines = await fetch_marketaux_headlines()
        if not headlines:
            logger.info("Marketaux unavailable or empty. Falling back to Google News RSS.")
            headlines = await fetch_rss_headlines()
        if headlines:
            theses = await generate_theses_with_llm(headlines)
            if theses:
                try:
                    # Clear old cache
                    db.query(MarketIntelligence).delete()
                    # Insert new cache
                    for t in theses:
                        db_item = MarketIntelligence(
                            id=t["id"],
                            author=t["author"],
                            author_title=t["author_title"],
                            source=t["source"],
                            date=t["date"],
                            title=t["title"],
                            content=t["content"],
                            image_url=t["image_url"],
                            ai_interpretation=t["ai_interpretation"],
                            full_report=t["full_report"]
                        )
                        db.add(db_item)
                    db.commit()
                    logger.info(f"Successfully cached {len(theses)} live financial theses.")
                    return _serialize_feed(db.query(MarketIntelligence).all())
                except Exception as e:
                    logger.error(f"Failed to commit new theses to DB: {e}")
                    db.rollback()

    # Return cached items
    if cached_items:
        return _serialize_feed(cached_items)

    # Fallback if everything fails
    logger.warning("All sync attempts failed. Serving fallback theses.")
    return FALLBACK_THESES

async def fetch_market_intelligence(db: Session) -> List[Dict[str, Any]]:
    """
    Entrypoint function.
    """
    return await sync_market_intelligence(db)

