// 네이버 금융 공개(비공식) API. 키 불필요, 문서화되어 있지 않아 응답 구조가 변경될 수 있음.
// 프로토타입 단계의 실데이터 소스로 사용 — 실서비스 전환 시 공식 시세/뉴스 제공사 계약 필요 (README TODO 참고).

import { searchStockIndex } from "./stockIndex.js";
import type { StockMetric } from "../types.js";
import { formatApproxMarketCap, formatApproxWon } from "./metricFormat.js";

export interface StockPrice {
  code: string;
  stockName: string;
  closePrice: number;
  fluctuationsRatio: number;
  marketStatus: string;
}

export interface StockSearchResult {
  code: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
  marketValue?: number;
  closePrice?: number;
  fluctuationsRatio?: number;
}

export interface NewsItem {
  title: string;
  body: string;
  url: string;
  publishedAt: string;
}

function parsePrice(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

const HTML_ENTITIES: Record<string, string> = {
  "&quot;": '"',
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&#39;": "'",
};

function decodeHtmlEntities(text: string): string {
  return text.replace(/&quot;|&amp;|&lt;|&gt;|&#39;/g, (match) => HTML_ENTITIES[match]);
}

const FETCH_TIMEOUT_MS = 5000;

export async function getStockPrice(code: string): Promise<StockPrice> {
  const res = await fetch(`https://m.stock.naver.com/api/stock/${code}/basic`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Naver price API returned ${res.status}`);
  const data = (await res.json()) as {
    stockName: string;
    closePrice: string;
    fluctuationsRatio: string;
    marketStatus: string;
  };
  return {
    code,
    stockName: data.stockName,
    closePrice: parsePrice(data.closePrice),
    fluctuationsRatio: Number(data.fluctuationsRatio),
    marketStatus: data.marketStatus,
  };
}

export async function getStockNews(code: string, limit = 5): Promise<NewsItem[]> {
  const res = await fetch(`https://m.stock.naver.com/api/news/stock/${code}?pageSize=${limit}&page=1`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Naver news API returned ${res.status}`);
  const groups = (await res.json()) as {
    items: {
      title: string;
      body: string;
      mobileNewsUrl: string;
      datetime: string; // "202609201551"
    }[];
  }[];

  return groups
    .flatMap((g) => g.items)
    .slice(0, limit)
    .map((item) => ({
      title: decodeHtmlEntities(item.title),
      body: decodeHtmlEntities(item.body),
      url: item.mobileNewsUrl,
      publishedAt: formatDatetime(item.datetime),
    }));
}

// "투자 지표" 메뉴에 보여줄 항목. 네이버가 이미 "1,675조 8,821억", "12.85배"처럼 화면에 바로 쓸 수
// 있게 포맷해서 주므로, 값을 다시 파싱하지 않고 그대로 사용한다 (금액류만 표시 직전에 한 번 더 손질한다).
// ETF는 PER/PBR/EPS 같은 기업 지표 자체가 없고 대신 NAV·수익률 등을 제공하므로 항목을 따로 둔다.
interface MetricField {
  code: string;
  label: string;
  format?: (raw: string) => string;
}

const STOCK_METRIC_FIELDS: MetricField[] = [
  { code: "marketValue", label: "시가총액", format: formatApproxMarketCap },
  { code: "per", label: "PER" },
  { code: "pbr", label: "PBR" },
  { code: "dividendYieldRatio", label: "배당수익률" },
  { code: "eps", label: "EPS", format: formatApproxWon },
  { code: "bps", label: "BPS", format: formatApproxWon },
];

// NAV·52주 최고/최저도 주식의 EPS/BPS와 같은 방식(formatApproxWon)으로 대략적인 금액만 보여준다.
const ETF_METRIC_FIELDS: MetricField[] = [
  { code: "nav", label: "NAV", format: formatApproxWon },
  { code: "fundPay", label: "펀드보수" },
  { code: "oneMonthEarnRate", label: "최근 1개월 수익률" },
  { code: "threeMonthEarnRate", label: "최근 3개월 수익률" },
  { code: "highPriceOf52Weeks", label: "52주 최고", format: formatApproxWon },
  { code: "lowPriceOf52Weeks", label: "52주 최저", format: formatApproxWon },
];

function hasMeaningfulValue(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== "" && value.trim() !== "N/A" && value.trim() !== "-";
}

export async function getStockMetrics(code: string): Promise<StockMetric[]> {
  const res = await fetch(`https://m.stock.naver.com/api/stock/${code}/integration`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Naver integration API returned ${res.status}`);
  const data = (await res.json()) as {
    stockEndType?: string;
    totalInfos?: { code: string; value: string }[];
  };
  const byCode = new Map((data.totalInfos ?? []).map((info) => [info.code, info.value]));
  const fields = data.stockEndType === "etf" ? ETF_METRIC_FIELDS : STOCK_METRIC_FIELDS;

  return fields
    .filter((f) => hasMeaningfulValue(byCode.get(f.code)))
    .map((f) => ({ label: f.label, value: (f.format ?? ((v: string) => v))(byCode.get(f.code)!) }));
}

// 국내 전체 상장 종목(KOSPI/KOSDAQ) 검색. 종목명 어디에 있든(예: '전자' → 삼성전자) 매칭되도록
// 자체 종목 인덱스를 우선 사용하고, 인덱스를 못 불러오면 네이버 자동완성(앞부분 일치)으로 폴백한다.
export async function searchStocks(query: string): Promise<StockSearchResult[]> {
  const [indexed, prefix] = await Promise.allSettled([
    searchStockIndex(query),
    searchStocksByPrefix(query),
  ]);
  if (indexed.status === "rejected" && prefix.status === "rejected") throw prefix.reason;

  const fromIndex = indexed.status === "fulfilled" ? indexed.value : [];
  if (indexed.status === "rejected") {
    console.warn("[naverFinance] stock index unavailable, using autocomplete only:", (indexed.reason as Error).message);
  }
  // 인덱스에 없는 종목이 자동완성에만 있는 경우(신규 상장 등)에도 기존처럼 검색되도록 뒤에 보완한다.
  const seen = new Set(fromIndex.map((s) => s.code));
  const extras = prefix.status === "fulfilled" ? prefix.value.filter((s) => !seen.has(s.code)) : [];
  return [...fromIndex, ...extras];
}

async function searchStocksByPrefix(query: string): Promise<StockSearchResult[]> {
  const res = await fetch(
    `https://ac.stock.naver.com/ac?q=${encodeURIComponent(query)}&target=stock`,
    { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
  );
  if (!res.ok) throw new Error(`Naver stock search API returned ${res.status}`);
  const data = (await res.json()) as {
    items: { code: string; name: string; typeCode: string }[];
  };
  return data.items
    .filter((item) => item.typeCode === "KOSPI" || item.typeCode === "KOSDAQ")
    .map((item) => ({
      code: item.code,
      name: item.name,
      market: item.typeCode as "KOSPI" | "KOSDAQ",
    }));
}

// 업종(예: 반도체, 자동차) 내 종목을 시가총액 상위 순으로 반환.
// Naver의 페이지네이션 기본 정렬이 등락률순이라, 상위 pageSize개를 받아 시총 기준으로 재정렬한다.
export async function getIndustryStocks(
  industryId: number,
  limit = 6
): Promise<StockSearchResult[]> {
  const res = await fetch(
    `https://m.stock.naver.com/api/stocks/industry/${industryId}?page=1&pageSize=50`,
    { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
  );
  if (!res.ok) throw new Error(`Naver industry API returned ${res.status}`);
  const data = (await res.json()) as {
    stocks: {
      itemCode: string;
      stockName: string;
      marketValue: string;
      closePrice: string;
      fluctuationsRatio: string;
      stockExchangeType: { nameKor: string };
    }[];
  };

  return data.stocks
    .filter(
      (s) => s.stockExchangeType.nameKor === "코스피" || s.stockExchangeType.nameKor === "코스닥"
    )
    .map((s) => ({
      code: s.itemCode,
      name: s.stockName,
      market: (s.stockExchangeType.nameKor === "코스피" ? "KOSPI" : "KOSDAQ") as
        | "KOSPI"
        | "KOSDAQ",
      marketValue: Number(s.marketValue.replace(/,/g, "")) || 0,
      closePrice: parsePrice(s.closePrice),
      fluctuationsRatio: Number(s.fluctuationsRatio),
    }))
    .sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0))
    .slice(0, limit);
}

// 가격 정보가 없는 목록(검색 자동완성 등)에 현재가·등락률을 덧붙인다.
// 종목별로 개별 조회해야 해서 목록이 클 경우 과도한 동시 요청을 막기 위해 호출 측에서 개수를 제한해야 함.
export async function attachPrices<T extends { code: string }>(stocks: T[]): Promise<T[]> {
  const enriched = await Promise.all(
    stocks.map(async (stock) => {
      try {
        const price = await getStockPrice(stock.code);
        return { ...stock, closePrice: price.closePrice, fluctuationsRatio: price.fluctuationsRatio };
      } catch {
        return stock;
      }
    })
  );
  return enriched;
}

function formatDatetime(raw: string): string {
  // "202609201551" -> ISO 8601
  const y = raw.slice(0, 4);
  const m = raw.slice(4, 6);
  const d = raw.slice(6, 8);
  const hh = raw.slice(8, 10);
  const mm = raw.slice(10, 12);
  return `${y}-${m}-${d}T${hh}:${mm}:00+09:00`;
}
