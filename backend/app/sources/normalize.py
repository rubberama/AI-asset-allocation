"""Common Document shape shared by every collector.

A Document is the atomic unit of macro research the platform reasons over: a news
article, a macro data observation, or a geopolitical event. Collectors normalize their
source-specific responses into this dict so downstream scoring/digestion is uniform.
"""
import hashlib
from datetime import datetime
from typing import Any, Dict, Optional

# Allowed source_type values
NEWS = "NEWS"
MACRO_DATA = "MACRO_DATA"
EVENT = "EVENT"


def make_document(
    source: str,
    source_type: str,
    title: str,
    text: str = "",
    url: str = "",
    published_at: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Builds a normalized Document dict with a stable, content-derived id."""
    key = f"{source}|{url or title}".encode("utf-8", errors="ignore")
    doc_id = hashlib.md5(key).hexdigest()[:16]
    return {
        "id": doc_id,
        "source": source,
        "source_type": source_type,
        "title": (title or "").strip(),
        "text": (text or "").strip(),
        "url": url or "",
        "published_at": published_at or datetime.utcnow().isoformat(),
        "payload": payload or {},
    }
