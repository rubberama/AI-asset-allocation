"""Collection orchestrator: run the macro collectors, score the results, and persist
them as Document rows. Also exposes the ranked research queue read path.
"""
import logging
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.db import Document
from app.sources.fred import fetch_fred_series
from app.sources.gdelt import fetch_gdelt_articles
from app.sources.normalize import make_document, NEWS
from app.research import score_documents, rank_queue

logger = logging.getLogger(__name__)


def _doc_row_to_dict(row: Document) -> Dict[str, Any]:
    return {
        "id": row.id,
        "source": row.source,
        "source_type": row.source_type,
        "title": row.title,
        "text": row.text or "",
        "url": row.url or "",
        "published_at": row.published_at or "",
        "payload": row.payload or {},
        "relevance": row.relevance or {},
        "recency_score": row.recency_score,
        "credibility": row.credibility,
        "composite_score": row.composite_score,
        "dedup_cluster": row.dedup_cluster,
        "status": row.status,
    }


def _upsert(db: Session, doc: Dict[str, Any]) -> None:
    existing = db.query(Document).filter(Document.id == doc["id"]).first()
    if existing:
        existing.relevance = doc.get("relevance")
        existing.recency_score = doc.get("recency_score")
        existing.credibility = doc.get("credibility")
        existing.composite_score = doc.get("composite_score")
        existing.dedup_cluster = doc.get("dedup_cluster")
        return
    db.add(Document(
        id=doc["id"],
        source=doc["source"],
        source_type=doc["source_type"],
        title=doc["title"],
        text=doc.get("text", ""),
        url=doc.get("url", ""),
        published_at=doc.get("published_at", ""),
        payload=doc.get("payload", {}),
        relevance=doc.get("relevance"),
        recency_score=doc.get("recency_score"),
        credibility=doc.get("credibility"),
        composite_score=doc.get("composite_score"),
        dedup_cluster=doc.get("dedup_cluster"),
        status="new",
    ))


async def _fetch_marketaux_as_docs() -> List[Dict[str, Any]]:
    """Reuse the existing Marketaux feed as additional NEWS documents (best-effort)."""
    try:
        from app.market_intelligence import fetch_marketaux_headlines
        headlines = await fetch_marketaux_headlines()
    except Exception as e:
        logger.warning(f"Marketaux as-docs fetch failed: {e}")
        return []
    docs = []
    for h in headlines:
        docs.append(make_document(
            source=h.get("source", "Marketaux"),
            source_type=NEWS,
            title=h.get("title", ""),
            text=h.get("description", "") or h.get("title", ""),
            url=h.get("url", ""),
            published_at=h.get("pubDate", ""),
            payload={"entities": h.get("entities", "")},
        ))
    return docs


async def collect_documents(db: Session) -> Dict[str, Any]:
    """Runs all collectors, scores the union with existing stored docs, and upserts."""
    collected: List[Dict[str, Any]] = []
    fred_docs = await fetch_fred_series()
    gdelt_docs = await fetch_gdelt_articles()
    marketaux_docs = await _fetch_marketaux_as_docs()
    collected.extend(fred_docs)
    collected.extend(gdelt_docs)
    collected.extend(marketaux_docs)

    # De-dup by id within this batch, then merge with everything already stored so
    # scoring/dedup clusters stay consistent across the whole corpus.
    by_id: Dict[str, Dict[str, Any]] = {}
    for d in collected:
        by_id[d["id"]] = d
    for row in db.query(Document).all():
        by_id.setdefault(row.id, _doc_row_to_dict(row))

    union = list(by_id.values())
    score_documents(union)

    for d in union:
        _upsert(db, d)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to persist documents: {e}")
        raise

    return {
        "collected_now": len(collected),
        "fred": len(fred_docs),
        "gdelt": len(gdelt_docs),
        "marketaux": len(marketaux_docs),
        "total_in_store": len(union),
    }


def get_research_queue(db: Session, asset_filter: Optional[str] = None, limit: int = 40) -> List[Dict[str, Any]]:
    """Returns the ranked, de-duplicated research queue from stored documents."""
    docs = [_doc_row_to_dict(r) for r in db.query(Document).all()]
    ranked = rank_queue(docs, asset_filter=asset_filter, collapse_duplicates=True)
    return ranked[:limit]
