// 네이버 금융 공개(비공식) API. 키 불필요, 문서화되어 있지 않아 응답 구조가 변경될 수 있음.
// 프로토타입 단계의 실데이터 소스로 사용 — 실서비스 전환 시 공식 시세/뉴스 제공사 계약 필요 (README TODO 참고).

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

// 국내 전체 상장 종목(KOSPI/KOSDAQ) 대상 검색 자동완성 API.
export async function searchStocks(query: string): Promise<StockSearchResult[]> {
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
