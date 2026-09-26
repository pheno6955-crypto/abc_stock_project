import { Router } from "express";
import type { PredictionDirection, PredictionResult } from "../types.js";
import { getPrediction, listPredictions, savePrediction, updatePrediction } from "../store/predictionStore.js";
import { getStockPrice } from "../services/naverFinance.js";
import { nextResolvableTime } from "../utils/tradingCalendar.js";

export const predictionsRouter = Router();

predictionsRouter.post("/", async (req, res) => {
  const { code, stockName, direction, userId } = req.body as {
    code?: string;
    stockName?: string;
    direction?: PredictionDirection;
    userId?: string;
  };

  if (!code || !stockName || (direction !== "UP" && direction !== "DOWN") || !userId) {
    return res.status(400).json({ error: "code, stockName, direction(UP|DOWN), userId are required" });
  }

  let referencePrice: number;
  try {
    referencePrice = (await getStockPrice(code)).closePrice;
  } catch (err) {
    console.warn(`[predictions] price lookup failed for ${code}:`, (err as Error).message);
    return res.status(502).json({ error: "현재가 조회에 실패했습니다. 잠시 후 다시 시도해주세요." });
  }

  const now = new Date();
  const prediction: PredictionResult = {
    id: `pred-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    code,
    stockName,
    direction,
    referencePrice,
    actualDirection: null,
    isCorrect: null,
    rewardClaimed: false,
    submittedAt: now.toISOString(),
    resolvableAt: nextResolvableTime(now).toISOString(),
    resolvedAt: null,
  };

  savePrediction(prediction);
  res.status(201).json(prediction);
});

predictionsRouter.get("/", (req, res) => {
  const { userId } = req.query as { userId?: string };
  const predictions = userId ? listPredictions().filter((p) => p.userId === userId) : listPredictions();
  res.json(predictions);
});

// 다음 거래일 종가 확정 후에만 판정 가능. resolvableAt 이전 호출은 명시적으로 거절한다.
async function resolveOne(prediction: PredictionResult): Promise<PredictionResult> {
  const currentPrice = (await getStockPrice(prediction.code)).closePrice;
  const actualDirection: PredictionDirection = currentPrice >= prediction.referencePrice ? "UP" : "DOWN";
  const isCorrect = actualDirection === prediction.direction;
  return updatePrediction(prediction.id, {
    actualDirection,
    isCorrect,
    resolvedAt: new Date().toISOString(),
  })!;
}

// 매 거래일 종가 확정 후 자동 실행되는 스케줄러([scheduler.ts](../services/predictionScheduler.ts))와
// 수동 판정 엔드포인트가 공유하는 일괄 판정 로직. resolvableAt이 지난 건만 판정한다.
export async function resolveEligiblePending(): Promise<{
  resolved: PredictionResult[];
  failed: string[];
}> {
  const now = Date.now();
  const eligible = listPredictions().filter(
    (p) => p.resolvedAt === null && new Date(p.resolvableAt).getTime() <= now
  );
  const resolved: PredictionResult[] = [];
  const failed: string[] = [];

  for (const prediction of eligible) {
    try {
      resolved.push(await resolveOne(prediction));
    } catch (err) {
      console.warn(`[predictions] resolve failed for ${prediction.id}:`, (err as Error).message);
      failed.push(prediction.id);
    }
  }

  return { resolved, failed };
}

predictionsRouter.post("/:id/resolve", async (req, res) => {
  const prediction = getPrediction(req.params.id);
  if (!prediction) return res.status(404).json({ error: "Prediction not found" });
  if (prediction.resolvedAt) return res.status(400).json({ error: "Already resolved" });
  if (new Date(prediction.resolvableAt).getTime() > Date.now()) {
    return res.status(400).json({
      error: "아직 판정 시점이 아니에요. 다음 거래일 종가 확정 후 자동으로 결과가 나와요.",
      resolvableAt: prediction.resolvableAt,
    });
  }

  try {
    res.json(await resolveOne(prediction));
  } catch (err) {
    console.warn(`[predictions] resolve price lookup failed for ${prediction.code}:`, (err as Error).message);
    res.status(502).json({ error: "현재가 조회에 실패했습니다. 잠시 후 다시 시도해주세요." });
  }
});

// 매 거래일 종가 확정 후 스케줄러가 호출하는 일괄 판정 엔드포인트 (운영 점검/수동 트리거용으로도 사용 가능).
predictionsRouter.post("/resolve-pending", async (_req, res) => {
  const { resolved, failed } = await resolveEligiblePending();
  res.json({ resolved: resolved.length, failed, results: resolved });
});

predictionsRouter.post("/:id/claim-reward", (req, res) => {
  const prediction = getPrediction(req.params.id);
  if (!prediction) return res.status(404).json({ error: "Prediction not found" });
  if (!prediction.isCorrect) return res.status(400).json({ error: "Prediction was not correct" });
  if (prediction.rewardClaimed) return res.status(400).json({ error: "Reward already claimed" });

  const updated = updatePrediction(req.params.id, { rewardClaimed: true });
  res.json(updated);
});
