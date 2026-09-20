import { Router } from "express";
import { generateReport, generateFactorAnalysis } from "../services/aiReport.js";
import {
  getStockPrice,
  searchStocks,
  getIndustryStocks,
  attachPrices,
} from "../services/naverFinance.js";

const SEARCH_PRICE_ENRICH_LIMIT = 10;

export const stocksRouter = Router();

// 검색어가 없을 때 보여줄 기본 목록 (실제로는 인기/거래량 상위 종목으로 교체 가능)
const POPULAR_STOCKS = [
  { code: "005930", name: "삼성전자", market: "KOSPI" as const },
  { code: "000660", name: "SK하이닉스", market: "KOSPI" as const },
  { code: "035420", name: "NAVER", market: "KOSPI" as const },
  { code: "035720", name: "카카오", market: "KOSPI" as const },
  { code: "005380", name: "현대차", market: "KOSPI" as const },
];

// id는 네이버 금융의 실제 업종 분류 코드 (https://m.stock.naver.com/api/stocks/industry 참고).
// 79개 전체 업종 중 사용자에게 익숙한 주요 업종만 선별.
const CATEGORIES = [
  { id: 278, label: "반도체" },
  { id: 273, label: "자동차" },
  { id: 272, label: "화학·2차전지" },
  { id: 267, label: "IT서비스" },
  { id: 263, label: "게임·엔터" },
  { id: 261, label: "제약·바이오" },
  { id: 301, label: "은행·금융" },
  { id: 266, label: "화장품" },
];

stocksRouter.get("/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();

  if (!q) {
    return res.json(await attachPrices(POPULAR_STOCKS));
  }

  try {
    const results = await searchStocks(q);
    const withPrices = await attachPrices(results.slice(0, SEARCH_PRICE_ENRICH_LIMIT));
    res.json([...withPrices, ...results.slice(SEARCH_PRICE_ENRICH_LIMIT)]);
  } catch (err) {
    console.warn(`[stocks] search failed for "${q}":`, (err as Error).message);
    res.status(502).json({ error: "종목 검색에 실패했습니다. 잠시 후 다시 시도해주세요." });
  }
});

stocksRouter.get("/categories", (_req, res) => {
  res.json(CATEGORIES);
});

stocksRouter.get("/categories/:id/stocks", async (req, res) => {
  const id = Number(req.params.id);
  const category = CATEGORIES.find((c) => c.id === id);
  if (!category) return res.status(404).json({ error: "Unknown category id" });

  try {
    const stocks = await getIndustryStocks(id);
    res.json(stocks);
  } catch (err) {
    console.warn(`[stocks] category stocks failed for ${id}:`, (err as Error).message);
    res.status(502).json({ error: "업종별 종목 조회에 실패했습니다. 잠시 후 다시 시도해주세요." });
  }
});

stocksRouter.get("/:code/report", async (req, res) => {
  let stockName: string;
  try {
    stockName = (await getStockPrice(req.params.code)).stockName;
  } catch (err) {
    console.warn(`[stocks] price lookup failed for ${req.params.code}:`, (err as Error).message);
    return res.status(404).json({ error: "존재하지 않거나 조회할 수 없는 종목코드입니다." });
  }
  const report = await generateReport(req.params.code, stockName);
  res.json(report);
});

stocksRouter.get("/:code/factors", async (req, res) => {
  let stockName: string;
  try {
    stockName = (await getStockPrice(req.params.code)).stockName;
  } catch (err) {
    console.warn(`[stocks] price lookup failed for ${req.params.code}:`, (err as Error).message);
    return res.status(404).json({ error: "존재하지 않거나 조회할 수 없는 종목코드입니다." });
  }
  const factors = await generateFactorAnalysis(req.params.code, stockName);
  res.json(factors);
});
