import unittest
from unittest.mock import AsyncMock, patch, MagicMock
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime
from app.db import Base, MarketIntelligence
from app.market_intelligence import sync_market_intelligence, fetch_rss_headlines_for_category

class TestMarketIntelligence(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

    def tearDown(self):
        self.db.close()

    async def test_fetch_rss_headlines_for_category_returns_many(self):
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
            self.assertEqual(len(res), 2)
            self.assertEqual(res[0]["title"], "Test Article 1")

    async def test_sync_market_intelligence_curates_ten_to_fifteen(self):
        # Mock the RSS fetch and the LLM selector / generation
        headlines = [{"title": f"Article {i}", "link": f"http://a{i}.com", "url": f"http://a{i}.com", "pubDate": datetime.utcnow().isoformat(), "source": "Test", "description": f"Summary {i}", "category_hint": "MACRO"} for i in range(35)]
        
        with patch("app.market_intelligence.fetch_rss_headlines_for_category", AsyncMock(return_value=headlines)), \
             patch("app.market_intelligence.select_top_articles_with_llm") as mock_select, \
             patch("app.market_intelligence.fetch_url_text", AsyncMock(return_value="Scraped text body of the article")), \
             patch("app.market_intelligence.generate_theses_with_llm") as mock_gen:
            
            # Selector returns first 12 articles
            mock_select.return_value = headlines[:12]
            
            # Gen returns a list containing a single fake analyzed report, specific to the article
            def mock_gen_side_effect(headlines_list, category_hint=None):
                h = headlines_list[0]
                return [
                    {
                        "id": f"t-{h['title']}",
                        "author": "NPS Research Desk",
                        "author_title": "Senior Macro Strategist",
                        "source": "Test",
                        "date": datetime.utcnow().isoformat(),
                        "title": f"Analyzed {h['title']}",
                        "content": "This is a detailed analysis.",
                        "image_url": "",
                        "ai_interpretation": {"summary": "Summary", "impacted_assets": ["MACRO"], "confidence": 0.8},
                        "full_report": {"executive_summary": "Exec summary", "rationale": "Rationale", "target_assets": "Assets", "recommendation": "Rec", "risk_factors": "Risks"}
                    }
                ]
            mock_gen.side_effect = mock_gen_side_effect
            
            res = await sync_market_intelligence(self.db, force=True)
            # Verify cache deleted and 12 curated items returned
            self.assertEqual(len(res), 12)
            self.assertEqual(self.db.query(MarketIntelligence).filter(MarketIntelligence.category == "NEWS").count(), 12)

if __name__ == "__main__":
    unittest.main()
