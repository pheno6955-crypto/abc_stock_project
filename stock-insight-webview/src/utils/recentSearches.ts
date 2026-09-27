import type { StockSummary } from "../types";

// "최근 검색" 목록. 로그인이 없는 프로토타입이라 이 브라우저(기기)에만 남는다 — guest-id와 같은 방식.
const STORAGE_KEY = "stock-insight:recent-searches";
const MAX_RECENT = 15;

type RecentStock = Pick<StockSummary, "code" | "name" | "market">;

// 가격/등락률은 시간이 지나면 틀린 값이 되므로 저장하지 않고, 보여줄 때마다 서버에서 새로 받아온다.
function stripToIdentity(stock: StockSummary): RecentStock {
  return { code: stock.code, name: stock.name, market: stock.market };
}

export function getRecentSearches(): RecentStock[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is RecentStock => p && typeof p.code === "string" && typeof p.name === "string"
    );
  } catch {
    return []; // 프라이빗 모드 등에서 localStorage 접근이 막혀 있어도 화면은 정상 동작해야 함
  }
}

export function addRecentSearch(stock: StockSummary): RecentStock[] {
  const next = [stripToIdentity(stock), ...getRecentSearches().filter((s) => s.code !== stock.code)].slice(
    0,
    MAX_RECENT
  );
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 저장 실패해도(용량 초과 등) 이번 세션 화면 표시에는 지장 없음
  }
  return next;
}

export function clearRecentSearches(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
}
