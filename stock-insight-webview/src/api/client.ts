import axios from "axios";
import type {
  StockSummary,
  StockCategory,
  StockReport,
  FactorAnalysis,
  PredictionDirection,
  PredictionResult,
  ChatMessage,
  StreakStatus,
} from "../types";

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

export async function getStockReport(code: string): Promise<StockReport> {
  const res = await api.get<StockReport>(`/stocks/${code}/report`);
  return res.data;
}

export async function getFactorAnalysis(code: string): Promise<FactorAnalysis> {
  const res = await api.get<FactorAnalysis>(`/stocks/${code}/factors`);
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
  const res = await api.post<PredictionResult>("/predictions", { code, stockName, direction });
  return res.data;
}

export async function getMyPredictions(): Promise<PredictionResult[]> {
  const res = await api.get<PredictionResult[]>("/predictions");
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
  const res = await api.get<StreakStatus>("/streak");
  return res.data;
}

export async function claimStreakBonus(): Promise<{ claimed: boolean; streak: number; bonusAmount: number }> {
  const res = await api.post("/streak/claim-bonus");
  return res.data;
}
