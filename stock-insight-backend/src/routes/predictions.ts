import { Router } from "express";
import type { PredictionDirection, PredictionResult } from "../types.js";
import { getPrediction, listPredictions, savePrediction, updatePrediction } from "../store/predictionStore.js";
import { getStockPrice } from "../services/naverFinance.js";

export const predictionsRouter = Router();

predictionsRouter.post("/", async (req, res) => {
  const { code, stockName, direction } = req.body as {
    code?: string;
    stockName?: string;
    direction?: PredictionDirection;
  };

  if (!code || !stockName || (direction !== "UP" && direction !== "DOWN")) {
    return res.status(400).json({ error: "code, stockName, direction(UP|DOWN) are required" });
  }

  let referencePrice: number;
  try {
    referencePrice = (await getStockPrice(code)).closePrice;
  } catch (err) {
    console.warn(`[predictions] price lookup failed for ${code}:`, (err as Error).message);
    return res.status(502).json({ error: "현재가 조회에 실패했습니다. 잠시 후 다시 시도해주세요." });
  }

  const prediction: PredictionResult = {
    id: `pred-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    code,
    stockName,
    direction,
    referencePrice,
    actualDirection: null,
    isCorrect: null,
    rewardClaimed: false,
    submittedAt: new Date().toISOString(),
    resolvedAt: null,
  };

  savePrediction(prediction);
  res.status(201).json(prediction);
});

predictionsRouter.get("/", (_req, res) => {
  res.json(listPredictions());
});

// 실제로는 익일 거래일 종가 확정 배치가 호출해야 할 판정 로직.
// 지금은 배치 스케줄러가 없어 호출 시점의 실시간가를 referencePrice와 비교해 즉시 판정한다.
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

predictionsRouter.post("/:id/resolve", async (req, res) => {
  const prediction = getPrediction(req.params.id);
  if (!prediction) return res.status(404).json({ error: "Prediction not found" });
  if (prediction.resolvedAt) return res.status(400).json({ error: "Already resolved" });

  try {
    res.json(await resolveOne(prediction));
  } catch (err) {
    console.warn(`[predictions] resolve price lookup failed for ${prediction.code}:`, (err as Error).message);
    res.status(502).json({ error: "현재가 조회에 실패했습니다. 잠시 후 다시 시도해주세요." });
  }
});

// 실제 배치 스케줄러(예: 매 거래일 종가 확정 후 cron)가 호출할 것을 상정한 일괄 판정 엔드포인트.
// 현재 이 서버에는 스케줄러가 붙어있지 않으므로, 운영 전환 시 이 엔드포인트를 배치 잡에서 호출하면 됨.
predictionsRouter.post("/resolve-pending", async (_req, res) => {
  const pending = listPredictions().filter((p) => p.resolvedAt === null);
  const results: PredictionResult[] = [];
  const failed: string[] = [];

  for (const prediction of pending) {
    try {
      results.push(await resolveOne(prediction));
    } catch (err) {
      console.warn(`[predictions] batch resolve failed for ${prediction.id}:`, (err as Error).message);
      failed.push(prediction.id);
    }
  }

  res.json({ resolved: results.length, failed, results });
});

predictionsRouter.post("/:id/claim-reward", (req, res) => {
  const prediction = getPrediction(req.params.id);
  if (!prediction) return res.status(404).json({ error: "Prediction not found" });
  if (!prediction.isCorrect) return res.status(400).json({ error: "Prediction was not correct" });
  if (prediction.rewardClaimed) return res.status(400).json({ error: "Reward already claimed" });

  const updated = updatePrediction(req.params.id, { rewardClaimed: true });
  res.json(updated);
});
