"""Research scoring & selection.

Turns a raw pile of collected Documents into a ranked, de-duplicated, asset-tagged
research queue. Relevance uses a macro→asset-class keyword taxonomy; de-duplication
uses TF-IDF cosine similarity (scikit-learn, already a dependency); recency uses an
exponential decay; credibility is a per-source weight. The composite score drives the
queue ordering that feeds the thesis engine.
"""
import logging
import math
from datetime import datetime, timezone
from typing import Any, Dict, List

import numpy as np

from app.config import ASSET_CLASSES

logger = logging.getLogger(__name__)

# Macro taxonomy: keywords that, when present, raise a document's relevance to a sleeve.
ASSET_KEYWORDS: Dict[str, List[str]] = {
    "KR_STOCK": ["korea", "korean", "kospi", "won", "samsung", "seoul", "bank of korea", "kr equity",
                 "ewy", "korean trade", "household credit", "ecos",
                 "semiconductor", "chip", "dram", "memory chip", "hbm", "sk hynix", "export"],
    "GLOBAL_STOCK": ["equity", "equities", "stock", "s&p", "nasdaq", "earnings", "tech", "ai",
                     "global growth", "msci", "wall street", "e-mini s&p",
                     "semiconductor", "chip", "nvidia", "memory chip"],
    "KR_BOND": ["korea", "korean", "bank of korea", "won", "kr bond", "korea bond", "ktb",
                "mpb", "bok rate", "monetary policy board", "bank of korea minutes"],
    "GLOBAL_BOND": ["treasury", "yield", "bond", "duration", "fed funds", "interest rate", "rate cut",
                    "rate hike", "federal reserve", "fomc", "inflation", "cpi", "pce", "fixed income",
                    "beige book", "ecb bulletin", "imf outlook", "treasury futures", "10-year treasury"],
    "ALTERNATIVE": ["oil", "crude", "energy", "commodity", "gold", "real estate", "reit", "infrastructure",
                    "sanctions", "supply chain", "geopolitical", "tariffs", "bitcoin",
                    "cot", "speculator", "commitment of traders", "positioning", "gold futures"],
}

# Per-source credibility (0..1). Primary data and tier-1 outlets rank highest.
SOURCE_CREDIBILITY = {
    # Primary / official data sources
    "FRED": 1.0, "ECOS": 0.98,
    # Central banks and multilateral institutions
    "FederalReserve": 1.0, "ECB": 1.0, "BOK_MPB": 0.95, "IMF": 0.95, "BIS": 0.95,
    # Official positioning / flow data
    "CFTC": 0.9, "ETF_FLOWS": 0.85,
    # Tier-1 financial press
    "reuters.com": 0.9, "bloomberg.com": 0.9, "ft.com": 0.9, "wsj.com": 0.9,
    "economist.com": 0.85, "cnbc.com": 0.75, "marketwatch.com": 0.7,
    # Policy research institutions
    "Brookings": 0.75, "PIIE": 0.75,
    # Commercial bank public research (best-effort)
    "GoldmanSachs": 0.8, "MorganStanley": 0.8, "JPMorgan": 0.8,
    # News RSS feeds
    "Reuters": 0.9, "FT": 0.9, "TheEconomist": 0.85,
    "CNBC": 0.75, "MarketWatch": 0.7, "YahooFinance": 0.65, "Investopedia": 0.65,
    "KoreaHerald": 0.7, "YonhapNews": 0.75,
    "NBER": 0.95, "WorldBank": 0.95,
}
DEFAULT_CREDIBILITY = 0.55
RECENCY_HALFLIFE_DAYS = 5.0
DEDUP_SIMILARITY_THRESHOLD = 0.82

# Composite weighting
W_RELEVANCE, W_RECENCY, W_CREDIBILITY = 0.5, 0.3, 0.2


def _parse_dt(s: str) -> datetime:
    """Best-effort parse of the various date formats sources emit; falls back to now."""
    if not s:
        return datetime.now(timezone.utc)
    s = s.strip()
    fmts = ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%Y%m%dT%H%M%SZ", "%Y%m%dT%H%M%S"]
    cleaned = s.replace("Z", "").split(".")[0].split("+")[0]
    for fmt in fmts:
        try:
            return datetime.strptime(cleaned, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(cleaned).replace(tzinfo=timezone.utc)
    except Exception:
        return datetime.now(timezone.utc)


def recency_weight(published_at: str) -> float:
    """Exponential decay: 1.0 today, halving every RECENCY_HALFLIFE_DAYS."""
    age_days = (datetime.now(timezone.utc) - _parse_dt(published_at)).total_seconds() / 86400.0
    age_days = max(0.0, age_days)
    return float(0.5 ** (age_days / RECENCY_HALFLIFE_DAYS))


def credibility_weight(source: str, source_type: str) -> float:
    if source_type in ("MACRO_DATA", "CB_PUBLICATION"):
        return 1.0
    if source_type == "POSITIONING":
        return SOURCE_CREDIBILITY.get(source or "", DEFAULT_CREDIBILITY)
    return SOURCE_CREDIBILITY.get((source or "").lower(), DEFAULT_CREDIBILITY)


def score_relevance(doc: Dict[str, Any]) -> Dict[str, float]:
    """Keyword-taxonomy relevance of a document to each of the 5 sleeves (0..1)."""
    blob = f"{doc.get('title', '')} {doc.get('text', '')}".lower()
    # FRED payload hint nudges the rates/inflation/growth → bond sleeves.
    hint = (doc.get("payload") or {}).get("hint", "")
    scores: Dict[str, float] = {}
    for asset in ASSET_CLASSES:
        hits = sum(1 for kw in ASSET_KEYWORDS[asset] if kw in blob)
        score = min(1.0, hits / 3.0)
        if hint in ("rates", "inflation") and asset in ("GLOBAL_BOND", "KR_BOND"):
            score = max(score, 0.6)
        if hint == "growth" and asset in ("GLOBAL_STOCK", "KR_STOCK"):
            score = max(score, 0.5)
        if hint == "fx" and asset in ("KR_STOCK", "KR_BOND"):
            score = max(score, 0.4)
        scores[asset] = round(score, 3)
    return scores


def dedup_documents(docs: List[Dict[str, Any]]) -> None:
    """Assigns a `dedup_cluster` id to each doc; near-duplicates share a cluster.
    Uses TF-IDF + cosine similarity (single-linkage union-find)."""
    n = len(docs)
    for i, d in enumerate(docs):
        d["dedup_cluster"] = str(i)
    if n < 2:
        return
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity
    except Exception as e:
        logger.warning(f"sklearn unavailable for dedup: {e}")
        return

    corpus = [f"{d.get('title','')} {d.get('text','')}" for d in docs]
    try:
        tfidf = TfidfVectorizer(stop_words="english", max_features=4000).fit_transform(corpus)
        sim = cosine_similarity(tfidf)
    except Exception as e:
        logger.warning(f"dedup vectorization failed: {e}")
        return

    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        parent[find(a)] = find(b)

    for i in range(n):
        for j in range(i + 1, n):
            if sim[i, j] >= DEDUP_SIMILARITY_THRESHOLD:
                union(i, j)

    for i, d in enumerate(docs):
        d["dedup_cluster"] = str(find(i))


def score_documents(docs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Enriches every document with relevance/recency/credibility/composite + dedup cluster."""
    for d in docs:
        rel = score_relevance(d)
        rec = recency_weight(d.get("published_at", ""))
        cred = credibility_weight(d.get("source", ""), d.get("source_type", ""))
        d["relevance"] = rel
        d["recency_score"] = round(rec, 3)
        d["credibility"] = round(cred, 3)
        d["composite_score"] = round(
            W_RELEVANCE * max(rel.values()) + W_RECENCY * rec + W_CREDIBILITY * cred, 4
        )
    dedup_documents(docs)
    return docs


# Report-grade sources that use the NEWS source_type but are institutional research,
# not consumer headlines — always kept in the research queue.
RESEARCH_GRADE_SOURCES = {
    "GoldmanSachs", "MorganStanley", "JPMorgan", "Brookings", "PIIE",
    "NBER", "WorldBank", "IMF", "BIS",
}
# A NEWS doc needs at least this relevance to one sleeve to count as "carrying a macro signal".
MACRO_SIGNAL_THRESHOLD = 0.33


def is_macro_relevant(doc: Dict[str, Any]) -> bool:
    """Decides whether a document belongs in the macro RESEARCH queue.

    Official data and reports (MACRO_DATA, CB_PUBLICATION, POSITIONING, EVENT) and
    institutional research sources always qualify. Generic NEWS qualifies only if it
    carries a real macro signal — tagged sleeve_hint=MACRO, or relevant to some sleeve
    via the keyword taxonomy. Pure company/markets noise is dropped (it remains available
    in the Market Intelligence feed)."""
    source_type = doc.get("source_type", "")
    if source_type != "NEWS":
        return True  # official data / reports / events
    if (doc.get("source") or "") in RESEARCH_GRADE_SOURCES:
        return True  # institutional research using the NEWS type
    if ((doc.get("payload") or {}).get("sleeve_hint") or "") == "MACRO":
        return True
    rel = doc.get("relevance") or {}
    return bool(rel) and max(rel.values()) >= MACRO_SIGNAL_THRESHOLD


def rank_queue(
    docs: List[Dict[str, Any]],
    asset_filter: str = None,
    collapse_duplicates: bool = True,
    macro_only: bool = True,
) -> List[Dict[str, Any]]:
    """Returns documents ranked by composite score, optionally filtered to one sleeve
    and collapsed to one representative per dedup cluster (highest score wins).

    When macro_only is True (default), generic company/markets news with no macro signal
    is excluded so the research queue stays focused on macro data, reports, and macro news."""
    result = docs
    if macro_only:
        result = [d for d in result if is_macro_relevant(d)]
    if asset_filter and asset_filter in ASSET_CLASSES:
        result = [d for d in result if (d.get("relevance") or {}).get(asset_filter, 0) > 0]

    if collapse_duplicates:
        best: Dict[str, Dict[str, Any]] = {}
        for d in result:
            c = d.get("dedup_cluster", d["id"])
            if c not in best or (d.get("composite_score") or 0) > (best[c].get("composite_score") or 0):
                best[c] = d
        result = list(best.values())

    return sorted(result, key=lambda d: d.get("composite_score") or 0, reverse=True)
