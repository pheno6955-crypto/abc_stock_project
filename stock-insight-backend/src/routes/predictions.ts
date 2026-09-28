import { Router } from "express";
import type { PredictionDirection, PredictionResult } from "../types.js";
import {
  getPrediction,
  listPredictions,
  savePrediction,
  updatePrediction,
  deletePredictionsByUser,
  deleteDemoPredictions,
} from "../store/predictionStore.js";
import { getStockPrice } from "../services/naverFinance.js";
import { nextResolvableTime } from "../utils/tradingCalendar.js";

export const predictionsRouter = Router();

const DUPLICATE_PREDICTION_MESSAGE =
  "이미 이 종목에 예측을 제출했어요. 결과가 확정된 뒤에 다시 참여할 수 있어요.";

function hasPendingPrediction(userId: string, code: string): boolean {
  return listPredictions().some((p) => p.userId === userId && p.code === code && p.resolvedAt === null);
}

predictionsRouter.post("/", async (req, res) => {
  const { code, stockName, direction, userId } = req.body as {
    code?: string;
    stockName?: string;
    direction?: PredictionDirection;
    userId?: string;
  };

  console.log("[predictions] POST request body:", { code, stockName, direction, userId });

  if (!code || !stockName || (direction !== "UP" && direction !== "DOWN") || !userId) {
    console.error("[predictions] validation error - missing required fields");
    return res.status(400).json({ error: "code, stockName, direction(UP|DOWN), userId are required" });
  }

  // 같은 종목에 결과가 확정되지 않은 예측이 이미 있으면 추가 예측 불가 (올리/내리 동시 선택, 중복 제출 방지)
  if (hasPendingPrediction(userId, code)) {
    return res.status(409).json({ error: DUPLICATE_PREDICTION_MESSAGE });
  }

  let referencePrice: number;
  try {
    console.log(`[predictions] fetching price for code: ${code}`);
    referencePrice = (await getStockPrice(code)).closePrice;
    console.log(`[predictions] got price for ${code}: ${referencePrice}`);
  } catch (err) {
    console.error(`[predictions] price lookup failed for ${code}:`, (err as Error).message);
    return res.status(502).json({ error: "현재가 조회에 실패했습니다. 잠시 후 다시 시도해주세요." });
  }

  // 현재가 조회(await) 사이에 같은 요청이 먼저 저장됐을 수 있어, 저장 직전에 한 번 더 확인한다.
  // (이 확인과 savePrediction 사이에는 await가 없어 동시 요청이 끼어들 수 없음)
  if (hasPendingPrediction(userId, code)) {
    return res.status(409).json({ error: DUPLICATE_PREDICTION_MESSAGE });
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

// 팀 검토/화면 점검용 예시 데이터. 종목·경우(적중/미적중/확정 대기)별로 하나씩,
// 딱 3건만 만들어서 화면에서 세 가지 상태를 한눈에 구분해 볼 수 있게 한다.
// TODO: 실서비스 전환 시 이 엔드포인트는 제거할 것 (테스트/시연 전용, 실제 서비스 로직과 무관).
const DEMO_PREDICTION_SPECS: {
  code: string;
  stockName: string;
  direction: PredictionDirection;
  actualDirection: PredictionDirection | null; // null이면 아직 확정 대기 상태로 만든다
  rewardClaimed: boolean;
}[] = [
  { code: "005930", stockName: "삼성전자", direction: "UP", actualDirection: "UP", rewardClaimed: false }, // 적중 (리워드 받기 버튼 테스트용)
  { code: "035720", stockName: "카카오", direction: "DOWN", actualDirection: "UP", rewardClaimed: false }, // 미적중
  { code: "005380", stockName: "현대차", direction: "UP", actualDirection: null, rewardClaimed: false }, // 확정 대기
];

predictionsRouter.post("/seed-demo", async (req, res) => {
  const { userId } = req.body as { userId?: string };
  if (!userId) return res.status(400).json({ error: "userId is required" });

  // 버튼을 여러 번 눌러도 카드가 계속 쌓이지 않도록, 이전에 만든 데모 데이터는 지우고 다시 만든다.
  deleteDemoPredictions(userId);

  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  const created: PredictionResult[] = [];
  for (const [i, spec] of DEMO_PREDICTION_SPECS.entries()) {
    let referencePrice: number;
    try {
      referencePrice = (await getStockPrice(spec.code)).closePrice;
    } catch {
      referencePrice = 50000; // 조회 실패 시에도 시연은 가능하도록 대체값 사용
    }
    const resolved = spec.actualDirection !== null;
    const prediction: PredictionResult = {
      id: `demo-${userId}-${spec.code}-${now}-${i}`,
      userId,
      code: spec.code,
      stockName: spec.stockName,
      direction: spec.direction,
      referencePrice,
      actualDirection: spec.actualDirection,
      isCorrect: resolved ? spec.actualDirection === spec.direction : null,
      rewardClaimed: spec.rewardClaimed,
      submittedAt: new Date(now - (i + 2) * DAY_MS).toISOString(),
      resolvableAt: resolved
        ? new Date(now - (i + 1) * DAY_MS).toISOString()
        : new Date(now + 3 * 60 * 60 * 1000).toISOString(),
      resolvedAt: resolved ? new Date(now - i * DAY_MS).toISOString() : null,
    };
    savePrediction(prediction);
    created.push(prediction);
  }

  res.status(201).json({ created: created.length, predictions: created });
});

// 랭킹 화면 점검용 예시 데이터. 이름 있는 사용자 여러 명이 서로 다른 승패 기록을 가진 상태로
// 랭킹에 바로 나오도록 만든다 (userId 자체를 이름으로 써서, 프론트가 그대로 화면에 보여줌).
// TODO: 실서비스 전환 시 이 엔드포인트는 제거할 것 (테스트/시연 전용).
const RANKING_DEMO_USERS: { userId: string; results: boolean[] }[] = [
  { userId: "하현석", results: [true, true, true, true, false] }, // 5전 4승 1패
  { userId: "조윤신", results: [true, true, true, false] }, // 4전 3승 1패
  { userId: "김태영", results: [true, true, false] }, // 3전 2승 1패
  { userId: "여효주", results: [true, false] }, // 2전 1승 1패
];

const RANKING_DEMO_STOCK_POOL: { code: string; stockName: string }[] = [
  { code: "005930", stockName: "삼성전자" },
  { code: "000660", stockName: "SK하이닉스" },
  { code: "035420", stockName: "NAVER" },
  { code: "035720", stockName: "카카오" },
  { code: "005380", stockName: "현대차" },
  { code: "000270", stockName: "기아" },
  { code: "373220", stockName: "LG에너지솔루션" },
  { code: "207940", stockName: "삼성바이오로직스" },
  { code: "068270", stockName: "셀트리온" },
  { code: "105560", stockName: "KB금융" },
];

predictionsRouter.post("/seed-ranking-demo", async (_req, res) => {
  const now = Date.now();
  const HOUR_MS = 60 * 60 * 1000;
  const priceCache = new Map<string, number>();

  async function priceFor(code: string): Promise<number> {
    if (!priceCache.has(code)) {
      try {
        priceCache.set(code, (await getStockPrice(code)).closePrice);
      } catch {
        priceCache.set(code, 50000); // 조회 실패해도 시연은 가능하도록 대체값 사용
      }
    }
    return priceCache.get(code)!;
  }

  let poolIndex = 0;
  const created: PredictionResult[] = [];
  for (const user of RANKING_DEMO_USERS) {
    for (const [i, hit] of user.results.entries()) {
      const stock = RANKING_DEMO_STOCK_POOL[poolIndex % RANKING_DEMO_STOCK_POOL.length];
      poolIndex += 1;
      const direction: PredictionDirection = i % 2 === 0 ? "UP" : "DOWN";
      const actualDirection: PredictionDirection = hit
        ? direction
        : direction === "UP"
          ? "DOWN"
          : "UP";
      const prediction: PredictionResult = {
        id: `rank-demo-${user.userId}-${stock.code}-${i}-${now}`,
        userId: user.userId,
        code: stock.code,
        stockName: stock.stockName,
        direction,
        referencePrice: await priceFor(stock.code),
        actualDirection,
        isCorrect: hit,
        rewardClaimed: hit,
        submittedAt: new Date(now - (i + 2) * HOUR_MS).toISOString(),
        resolvableAt: new Date(now - (i + 1) * HOUR_MS).toISOString(),
        resolvedAt: new Date(now - i * HOUR_MS).toISOString(),
      };
      savePrediction(prediction);
      created.push(prediction);
    }
  }

  res.status(201).json({ created: created.length, users: RANKING_DEMO_USERS.map((u) => u.userId) });
});

// 테스트 중 만들어진 특정 userId의 예측을 지운다 (실제 회원 식별자를 함부로 지우지 않도록,
// 반드시 정확한 userId를 알고 있을 때만 호출하는 용도 — 명확히 테스트 데이터인 경우에만 사용할 것).
// TODO: 실서비스 전환 시 이 엔드포인트는 제거할 것 (테스트/시연 전용).
predictionsRouter.post("/dev-purge-user", (req, res) => {
  const { userId } = req.body as { userId?: string };
  if (!userId) return res.status(400).json({ error: "userId is required" });
  res.json({ removed: deletePredictionsByUser(userId) });
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
