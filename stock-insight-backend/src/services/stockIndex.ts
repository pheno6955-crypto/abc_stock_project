// 국내 상장 종목(KOSPI/KOSDAQ) 전체 목록을 메모리에 들고 있다가 "포함" 검색을 제공한다.
// 네이버 자동완성 API는 종목명 "앞부분 일치"만 지원해서(예: '전자' → 삼성전자 미검색) 자체 인덱스로 대체.
import type { StockSearchResult } from "./naverFinance.js";

const PAGE_SIZE = 100; // 네이버 목록 API의 최대 pageSize
const FETCH_TIMEOUT_MS = 8000;
const FETCH_CONCURRENCY = 6;
const INDEX_TTL_MS = 6 * 60 * 60 * 1000;
const MARKETS = ["KOSPI", "KOSDAQ"] as const;

export interface IndexedStock extends StockSearchResult {
  key: string; // 공백 제거 + 소문자 정규화된 종목명
  stockEndType?: string; // stock / etf / etn
}

let cache: { loadedAt: number; stocks: IndexedStock[] } | null = null;
let loading: Promise<IndexedStock[]> | null = null;

export function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "");
}

interface MarketPage {
  totalCount: number;
  stocks: {
    itemCode: string;
    stockName: string;
    stockEndType: string;
    marketValueRaw?: string;
  }[];
}

async function fetchPage(market: (typeof MARKETS)[number], page: number): Promise<MarketPage> {
  const res = await fetch(
    `https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${page}&pageSize=${PAGE_SIZE}`,
    { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
  );
  if (!res.ok) throw new Error(`Naver market list API returned ${res.status}`);
  return (await res.json()) as MarketPage;
}

async function fetchMarket(market: (typeof MARKETS)[number]): Promise<IndexedStock[]> {
  const first = await fetchPage(market, 1);
  const pageCount = Math.ceil(first.totalCount / PAGE_SIZE);
  const pages: MarketPage[] = [first];

  const remaining = Array.from({ length: Math.max(0, pageCount - 1) }, (_, i) => i + 2);
  for (let i = 0; i < remaining.length; i += FETCH_CONCURRENCY) {
    const batch = remaining.slice(i, i + FETCH_CONCURRENCY);
    pages.push(...(await Promise.all(batch.map((p) => fetchPage(market, p)))));
  }

  // 주식뿐 아니라 ETF/ETN도 종목 검색 대상 (예: TIGER, KODEX)
  return pages
    .flatMap((p) => p.stocks)
    .map((s) => ({
      code: s.itemCode,
      name: s.stockName,
      market,
      // 다른 업종 목록과 같은 '억원' 단위 (화면에서 조원/억원으로 환산해 표시)
      marketValue: s.marketValueRaw ? Math.round(Number(s.marketValueRaw) / 1e8) : undefined,
      key: normalize(s.stockName),
      stockEndType: s.stockEndType,
    }));
}

async function loadIndex(): Promise<IndexedStock[]> {
  const perMarket = await Promise.all(MARKETS.map(fetchMarket));
  const stocks = perMarket.flat();
  if (stocks.length === 0) throw new Error("stock index is empty");
  cache = { loadedAt: Date.now(), stocks };
  console.log(`[stockIndex] loaded ${stocks.length} stocks`);
  return stocks;
}

export async function getStockIndex(): Promise<IndexedStock[]> {
  if (cache && Date.now() - cache.loadedAt < INDEX_TTL_MS) return cache.stocks;
  if (!loading) {
    loading = loadIndex()
      .catch((err) => {
        // 갱신 실패 시 만료된 캐시라도 있으면 계속 사용, 없으면 호출 측에서 폴백하도록 에러 전달
        if (cache) return cache.stocks;
        throw err;
      })
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}

// 서버 시작 시 미리 로드해 첫 검색 지연을 없앤다. 실패해도 검색 시 재시도.
export function warmStockIndex(): void {
  getStockIndex().catch((err) =>
    console.warn("[stockIndex] warm-up failed:", (err as Error).message)
  );
}

// 순위: 정확히 일치 > 앞부분 일치 > 이름에 포함 > 종목코드 앞부분 일치. 같은 순위 안에서는 시가총액 큰 순.
export function rankStocks(
  stocks: IndexedStock[],
  query: string,
  limit = 30
): StockSearchResult[] {
  const q = normalize(query);
  if (!q) return [];

  const scored: { stock: IndexedStock; tier: number }[] = [];
  for (const stock of stocks) {
    let tier = -1;
    if (stock.key === q) tier = 0;
    else if (stock.key.startsWith(q)) tier = 1;
    else if (stock.key.includes(q)) tier = 2;
    else if (stock.code.startsWith(q)) tier = 3;
    if (tier >= 0) scored.push({ stock, tier });
  }

  return scored
    .sort((a, b) => a.tier - b.tier || (b.stock.marketValue ?? 0) - (a.stock.marketValue ?? 0))
    .slice(0, limit)
    // 검색 결과에는 시가총액을 싣지 않는다(정렬에만 사용). 화면은 '시장 · 종목코드'를 보여준다.
    .map(({ stock: { key: _key, stockEndType: _type, marketValue: _mv, ...rest } }) => rest);
}

export async function searchStockIndex(query: string, limit = 30): Promise<StockSearchResult[]> {
  return rankStocks(await getStockIndex(), query, limit);
}

// 시가총액 상위 ETF (카테고리 "ETF"용)
export async function getTopEtfs(limit = 10): Promise<StockSearchResult[]> {
  const stocks = await getStockIndex();
  return stocks
    .filter((s) => s.stockEndType === "etf")
    .sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0))
    .slice(0, limit)
    .map(({ key: _key, stockEndType: _type, ...rest }) => rest);
}