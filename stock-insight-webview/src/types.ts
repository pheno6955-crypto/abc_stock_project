export interface StockSummary {
  code: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
  marketValue?: number; // 억원 단위, 업종별 목록에서만 제공
  closePrice?: number; // 현재가(원)
  fluctuationsRatio?: number; // 전일 대비 등락률(%)
}

export interface StockCategory {
  id: number;
  label: string;
}

export interface StockReport {
  code: string;
  generatedAt: string;
  summary: string;
  keyIssues: { title: string; url: string }[];
  investmentPoints: string[];
  sources: { title: string; url: string; publishedAt: string }[];
}

export interface FactorItem {
  label: string;
  weight: number;
  description: string;
}

export interface FactorAnalysis {
  code: string;
  bullishFactors: FactorItem[];
  bearishFactors: FactorItem[];
  note?: string;
  priceChangePct?: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type PredictionDirection = "UP" | "DOWN";

export interface StreakStatus {
  currentStreak: number;
  todayParticipated: boolean;
  milestoneEvery: number;
  bonusAmount: number;
  bonusAvailable: boolean;
}

export interface RankingEntry {
  rank: number;
  userId: string;
  isMe: boolean;
  hits: number;
  attempts: number;
  accuracy: number;
}

export interface RankingResponse {
  period: "week" | "month";
  periodStart: string;
  entries: RankingEntry[];
  me: RankingEntry | null;
}

export interface PredictionResult {
  id: string;
  userId: string;
  code: string;
  stockName: string;
  direction: PredictionDirection;
  referencePrice: number;
  actualDirection: PredictionDirection | null;
  isCorrect: boolean | null;
  rewardClaimed: boolean;
  submittedAt: string;
  resolvableAt: string;
  resolvedAt: string | null;
}
