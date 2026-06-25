# Market Intelligence Feed Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modify the backend market intelligence feed refresh flow to fetch at least 30 fresh articles from RSS, use the LLM to select the top 10-15 articles, fetch the full webpage content for the selected articles, and generate structured reports for curation.

**Architecture:** We will update `app/market_intelligence.py` by:
1. Enhancing `fetch_rss_headlines_for_category` to retrieve all available RSS articles, applying date checking, and ensuring we get a combined pool of at least 30 fresh articles (by extending the date range dynamically if needed).
2. Implementing an LLM selection call `select_top_articles_with_llm` to pick 10-15 articles from the pool.
3. Concurrently fetching the full webpage content of the chosen 10-15 articles, falling back to RSS summaries if fetching fails.
4. Generating detailed Bloomberg report theses for the selected articles in parallel and caching them in the SQLite DB.

**Tech Stack:** Python, SQLAlchemy, httpx, openrouter (Nemotron Ultra), asyncio

## Global Constraints
- Do not introduce external dependencies outside the existing requirements.txt unless necessary.
- Ensure SQL database concurrency / thread-safety by committing sessions properly.
- All code changes must be covered by unit tests.
- Always use the exact asset classes `KR_STOCK`, `GLOBAL_STOCK`, `KR_BOND`, `GLOBAL_BOND`, `ALTERNATIVE`.

---

### Task 1: Add unit tests for the selection and feed refresh behavior

**Files:**
- Create: `backend/tests/test_market_intelligence.py`

**Interfaces:**
- Consumes: `app.market_intelligence.sync_market_intelligence`
- Produces: Test assertions for refresh count and article curation quality

- [ ] **Step 1: Write the unit tests**
  Create `backend/tests/test_market_intelligence.py` with mock helpers to test selection, scraping, and cache persistence.
  ```python
  import pytest
  from unittest.mock import AsyncMock, patch, MagicMock
  from sqlalchemy import create_engine
  from sqlalchemy.orm import sessionmaker
  from datetime import datetime
  from app.db import Base, MarketIntelligence
  from app.market_intelligence import sync_market_intelligence, fetch_rss_headlines_for_category

  @pytest.fixture
  def db_session():
      engine = create_engine("sqlite:///:memory:")
      Base.metadata.create_all(bind=engine)
      Session = sessionmaker(bind=engine)
      session = Session()
      yield session
      session.close()

  @pytest.mark.asyncio
  async def test_fetch_rss_headlines_for_category_returns_many():
      # Test that RSS returns items and applies date logic
      with patch("httpx.AsyncClient.get") as mock_get:
          mock_response = MagicMock()
          mock_response.status_code = 200
          mock_response.content = b"""<rss><channel>
          <item><title>Test Article 1</title><link>http://t1.com</link><pubDate>Wed, 25 Jun 2026 09:00:00 GMT</pubDate><source>Test Source</source></item>
          <item><title>Test Article 2</title><link>http://t2.com</link><pubDate>Wed, 25 Jun 2026 08:00:00 GMT</pubDate><source>Test Source</source></item>
          </channel></rss>"""
          mock_get.return_value = mock_response
          
          res = await fetch_rss_headlines_for_category("MACRO", "test query", limit=10)
          assert len(res) == 2
          assert res[0]["title"] == "Test Article 1"

  @pytest.mark.asyncio
  async def test_sync_market_intelligence_curates_ten_to_fifteen(db_session):
      # Mock the RSS fetch and the LLM selector / generation
      headlines = [{"title": f"Article {i}", "link": f"http://a{i}.com", "url": f"http://a{i}.com", "pubDate": datetime.utcnow().isoformat(), "source": "Test", "description": f"Summary {i}", "category_hint": "MACRO"} for i in range(35)]
      
      with patch("app.market_intelligence.fetch_rss_headlines_for_category", AsyncMock(return_value=headlines)), \
           patch("app.market_intelligence.select_top_articles_with_llm") as mock_select, \
           patch("app.market_intelligence.fetch_url_text", AsyncMock(return_value="Scraped text body of the article")), \
           patch("app.market_intelligence.generate_theses_with_llm") as mock_gen:
          
          # Selector returns indices 0 to 11 (12 articles)
          mock_select.return_value = headlines[:12]
          
          # Gen returns fake analyzed reports for those 12
          mock_gen.return_value = [
              {
                  "id": f"t{i}",
                  "author": "NPS Research Desk",
                  "author_title": "Senior Macro Strategist",
                  "source": "Test",
                  "date": datetime.utcnow().isoformat(),
                  "title": f"Analyzed Article {i}",
                  "content": "This is a detailed analysis.",
                  "image_url": "",
                  "ai_interpretation": {"summary": "Summary", "impacted_assets": ["MACRO"], "confidence": 0.8},
                  "full_report": {"executive_summary": "Exec summary", "rationale": "Rationale", "target_assets": "Assets", "recommendation": "Rec", "risk_factors": "Risks"}
              } for i in range(12)
          ]
          
          res = await sync_market_intelligence(db_session, force=True)
          # Verify cache deleted and 12 curated items returned
          assert len(res) == 12
          assert db_session.query(MarketIntelligence).filter(MarketIntelligence.category == "NEWS").count() == 12
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `pytest backend/tests/test_market_intelligence.py`
  Expected: FAIL (or ImportError/failure because test module is not fully defined/aligned).

- [ ] **Step 3: Commit initial test**
  ```bash
  git add backend/tests/test_market_intelligence.py
  git commit -m "test: add scaffolding for market intelligence feed refresh"
  ```

---

### Task 2: Implement feed pool collection in `fetch_rss_headlines_for_category`

**Files:**
- Modify: `backend/app/market_intelligence.py`

**Interfaces:**
- Consumes: None (internal helpers)
- Produces: Enhanced headline dictionary lists with larger limits and date logic fallback

- [ ] **Step 1: Update `fetch_rss_headlines_for_category`**
  Modify `fetch_rss_headlines_for_category` to iterate over all items returned by the RSS feed, applying the date check to construct a larger list of fresh articles, and fallback to 14 days if the pool size is too small.
  ```python
  # Change function signature/body to read all items, apply date filter, and fallback if necessary.
  ```

- [ ] **Step 2: Verify tests fail or pass accordingly**
  Run the test suite to ensure the headline collection works.

- [ ] **Step 3: Commit Task 2 changes**
  ```bash
  git add backend/app/market_intelligence.py
  git commit -m "feat: increase RSS headline pool and implement dynamic recency fallback"
  ```

---

### Task 3: Implement LLM Selection and Scraping in `sync_market_intelligence`

**Files:**
- Modify: `backend/app/market_intelligence.py`

**Interfaces:**
- Consumes: `fetch_rss_headlines_for_category`, `fetch_url_text`
- Produces: `select_top_articles_with_llm`, parallel scraper call, and parallel thesis generator.

- [ ] **Step 1: Implement `select_top_articles_with_llm`**
  Add the selection function which asks the LLM to choose the top 10-15 articles from the pool of at least 30 articles.
  ```python
  async def select_top_articles_with_llm(headlines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
      # Prompt the model to select 10-15 articles
  ```

- [ ] **Step 2: Update `sync_market_intelligence`**
  Refactor the logic to collect at least 30 articles, call `select_top_articles_with_llm`, fetch/scrape their contents in parallel, and generate structured theses using LLM in parallel.

- [ ] **Step 3: Run the unit tests**
  Run: `pytest backend/tests/test_market_intelligence.py`
  Expected: PASS

- [ ] **Step 4: Commit Task 3 changes**
  ```bash
  git add backend/app/market_intelligence.py
  git commit -m "feat: implement LLM selection, parallel scraping, and parallel thesis generation"
  ```

---

### Task 4: Integration testing and validation

**Files:**
- Create/Run: `backend/scratch/test_refresh_manual.py`

- [ ] **Step 1: Create manual integration verification script**
  Create a script `backend/scratch/test_refresh_manual.py` that gets the real DB and triggers the sync, printing results.

- [ ] **Step 2: Execute manual verification**
  Run: `python backend/scratch/test_refresh_manual.py`
  Expected: Success output showing 10-15 articles created.

- [ ] **Step 3: Commit & Cleanup**
  ```bash
  git add backend/scratch/test_refresh_manual.py
  git commit -m "test: add manual integration test script for market intel feed refresh"
  ```
