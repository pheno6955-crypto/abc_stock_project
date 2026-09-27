import axios from "axios";
import type {
  StockSummary,
  StockCategory,
  StockReport,
  FactorAnalysis,
  StockMetric,
  PredictionDirection,
  PredictionResult,
  ChatMessage,
  StreakStatus,
  RankingResponse,
} from "../types";
import { getCurrentUserId } from "../utils/identity";

const apiBaseURL = import.meta.env.VITE_API_BASE_URL ?? `http://${window.location.hostname}:8787/api`;

const api = axios.create({
  baseURL: apiBaseURL,
  timeout: 30000,
});

export async function searchStocks(query: string): Promise<StockSummary[]> {
  const res = await api.get<StockSummary[]>("/stocks/search", { params: { q: query } });
  return res.data;
}

export async function getCategories(): Promise<StockCategory[]> {
  const res = await api.get<StockCategory[]>("/stocks/categories");
  return res.data;
}

export async function getCategoryStocks(categoryId: number): Promise<StockSummary[]> {
  const res = await api.get<StockSummary[]>(`/stocks/categories/${categoryId}/stocks`);
  return res.data;
}

// "최근 검색" 목록에 최신 현재가·등락률을 다시 붙여서 가져온다.
export async function getRecentSearchPrices(
  items: { code: string; name: string; market: "KOSPI" | "KOSDAQ" }[]
): Promise<StockSummary[]> {
  if (items.length === 0) return [];
  const res = await api.post<StockSummary[]>("/stocks/recent-prices", { items });
  return res.data;
}

export async function getStockReport(code: string): Promise<StockReport> {
  const res = await api.get<StockReport>(`/stocks/${code}/report`);
  return res.data;
}

export async function getFactorAnalysis(code: string): Promise<FactorAnalysis> {
  const res = await api.get<FactorAnalysis>(`/stocks/${code}/factors`);
  return res.data;
}

export async function getStockMetrics(code: string): Promise<StockMetric[]> {
  const res = await api.get<StockMetric[]>(`/stocks/${code}/metrics`);
  return res.data;
}

export async function chatAboutStock(code: string, messages: ChatMessage[]): Promise<string> {
  const res = await api.post<{ reply: string }>(`/stocks/${code}/chat`, { messages });
  return res.data.reply;
}

export async function submitPrediction(
  code: string,
  stockName: string,
  direction: PredictionDirection
): Promise<PredictionResult> {
  const userId = await getCurrentUserId();
  console.log("[submitPrediction] userId:", userId);
  console.log("[submitPrediction] calling POST /predictions with:", { code, stockName, direction, userId });
  const res = await api.post<PredictionResult>("/predictions", { code, stockName, direction, userId });
  console.log("[submitPrediction] response:", res.data);
  return res.data;
}

// 팀 검토용 예시 데이터(적중/미적중/확정 대기 몇 건)를 지금 이 브라우저의 계정 앞으로 만들어 넣는다.
// TODO: 실서비스 전환 시 이 함수와 백엔드의 /predictions/seed-demo 엔드포인트를 함께 제거할 것.
export async function seedDemoPredictions(): Promise<void> {
  const userId = await getCurrentUserId();
  await api.post("/predictions/seed-demo", { userId });
}

export async function getMyPredictions(): Promise<PredictionResult[]> {
  const userId = await getCurrentUserId();
  const res = await api.get<PredictionResult[]>("/predictions", { params: { userId } });
  return res.data;
}

export async function claimReward(predictionId: string): Promise<void> {
  await api.post(`/predictions/${predictionId}/claim-reward`);
}

export async function resolvePrediction(predictionId: string): Promise<PredictionResult> {
  const res = await api.post<PredictionResult>(`/predictions/${predictionId}/resolve`);
  return res.data;
}

export async function getStreak(): Promise<StreakStatus> {
  const userId = await getCurrentUserId();
  const res = await api.get<StreakStatus>("/streak", { params: { userId } });
  return res.data;
}

export async function claimStreakBonus(): Promise<{ claimed: boolean; streak: number; bonusAmount: number }> {
  const userId = await getCurrentUserId();
  const res = await api.post("/streak/claim-bonus", { userId });
  return res.data;
}

export async function getRankings(period: "week" | "month"): Promise<RankingResponse> {
  const userId = await getCurrentUserId();
  const res = await api.get<RankingResponse>("/rankings", { params: { period, userId } });
  return res.data;
}
