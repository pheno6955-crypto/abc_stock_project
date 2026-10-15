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
import {
  getDailyCloses,
  getFirstClosedCloseOnOrAfter,
  getReferencePrice,
  type DailyClose,
} from "../services/naverFinance.js";
import { seedRankingDemo } from "../services/rankingDemoSeed.js";
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
    referencePrice = await getReferencePrice(code);
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

// 팀 검토/화면 점검용 예시 데이터. 적중/미적중/확정 대기를 종목별로 하나씩 딱 3건만 만든다.
// 적중·미적중 카드는 가짜 가격이 아니라 실제 종목의 "최근 거래일 쌍(기준일 종가 → 다음 거래일 종가)"으로 만든다:
// 날짜·기준가·종가는 모두 실제 값이고, 의도한 결과가 되도록 방향만 골라서 넣는다.
// 확정 대기 카드는 지금 가격으로 제출한 것과 같고, 판정 시각도 실제 규칙(다음 평일 15:40)을 따른다.
// TODO: 실서비스 전환 시 이 엔드포인트는 제거할 것 (테스트/시연 전용, 실제 서비스 로직과 무관).
type DemoOutcome = "hit" | "miss" | "pending";
const DEMO_PREDICTION_SPECS: { code: string; stockName: string; outcome: DemoOutcome; rewardClaimed: boolean }[] = [
  { code: "005930", stockName: "삼성전자", outcome: "hit", rewardClaimed: false }, // 적중 (리워드 받기 버튼 테스트용)
  { code: "035720", stockName: "카카오", outcome: "miss", rewardClaimed: false }, // 미적중
  { code: "005380", stockName: "현대차", outcome: "pending", rewardClaimed: false }, // 확정 대기
];

const kstIso = (date: string, time: string): string => new Date(`${date}T${time}+09:00`).toISOString();

// 종가가 달라진(방향이 분명한) 가장 최근 거래일 쌍을 찾는다.
function latestClosePair(closes: DailyClose[]): { from: DailyClose; to: DailyClose } | null {
  for (let k = closes.length - 1; k >= 1; k--) {
    if (closes[k].closePrice !== closes[k - 1].closePrice) return { from: closes[k - 1], to: closes[k] };
  }
  return null;
}

predictionsRouter.post("/seed-demo", async (req, res) => {
  const { userId } = req.body as { userId?: string };
  if (!userId) return res.status(400).json({ error: "userId is required" });

  // 버튼을 여러 번 눌러도 카드가 계속 쌓이지 않도록, 이전에 만든 데모 데이터는 지우고 다시 만든다.
  deleteDemoPredictions(userId);

  const now = new Date();
  const created: PredictionResult[] = [];

  for (const [i, spec] of DEMO_PREDICTION_SPECS.entries()) {
    const id = `demo-${userId}-${spec.code}-${now.getTime()}-${i}`;
    const base = { id, userId, code: spec.code, stockName: spec.stockName, rewardClaimed: spec.rewardClaimed };

    let prediction: PredictionResult | null = null;

    if (spec.outcome !== "pending") {
      try {
        const pair = latestClosePair(await getDailyCloses(spec.code));
        if (pair) {
          const actualDirection: PredictionDirection = pair.to.closePrice >= pair.from.closePrice ? "UP" : "DOWN";
          const direction: PredictionDirection =
            spec.outcome === "hit" ? actualDirection : actualDirection === "UP" ? "DOWN" : "UP";
          prediction = {
            ...base,
            direction,
            referencePrice: pair.from.closePrice,
            actualDirection,
            isCorrect: spec.outcome === "hit",
            submittedAt: kstIso(pair.from.date, "16:00:00"),
            resolvableAt: kstIso(pair.to.date, "15:40:00"),
            resolvedAt: kstIso(pair.to.date, "15:41:00"),
            resolvedPrice: pair.to.closePrice,
          };
        }
      } catch (err) {
        console.warn(`[seed-demo] 일별 종가 조회 실패 (${spec.code}):`, (err as Error).message);
      }
    }

    if (!prediction && spec.outcome !== "pending") {
      return res.status(502).json({ error: "실제 종가를 가져오지 못했어요. 잠시 후 다시 시도해주세요." });
    }

    if (!prediction) {
      let referencePrice: number;
      try {
        referencePrice = await getReferencePrice(spec.code);
      } catch {
        referencePrice = 50000; // 조회 실패 시에도 시연은 가능하도록 대체값 사용
      }
      prediction = {
        ...base,
        direction: "UP",
        referencePrice,
        actualDirection: null,
        isCorrect: null,
        submittedAt: now.toISOString(),
        resolvableAt: nextResolvableTime(now).toISOString(),
        resolvedAt: null,
        resolvedPrice: null,
      };
    }

    savePrediction(prediction);
    created.push(prediction);
  }

  res.status(201).json({ created: created.length, predictions: created });
});

// 랭킹 화면 점검용 샘플 데이터 (실제 로직은 services/rankingDemoSeed.ts, 서버 시작 때도 같은 함수로 채워짐).
// TODO: 실서비스 전환 시 이 엔드포인트는 제거할 것 (테스트/시연 전용).
predictionsRouter.post("/seed-ranking-demo", async (_req, res) => {
  const priceCache = new Map<string, number>();
  const priceFor = async (code: string): Promise<number> => {
    if (!priceCache.has(code)) {
      try {
        priceCache.set(code, await getReferencePrice(code));
      } catch {
        priceCache.set(code, 50000); // 조회 실패해도 시연은 가능하도록 대체값 사용
      }
    }
    return priceCache.get(code)!;
  };
  res.status(201).json(await seedRankingDemo(priceFor));
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
// 판정은 서버가 언제 깨어나 실행하든 "판정 기준일(resolvableAt의 KST 날짜) 이후 처음 마감된 거래일의 종가"로 한다.
async function resolveOne(prediction: PredictionResult): Promise<PredictionResult> {
  const resolvableDateKst = new Date(new Date(prediction.resolvableAt).getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const close = await getFirstClosedCloseOnOrAfter(prediction.code, resolvableDateKst);
  if (!close) throw new Error("판정 기준일의 종가가 아직 확정되지 않았어요");

  const actualDirection: PredictionDirection = close.closePrice >= prediction.referencePrice ? "UP" : "DOWN";
  const isCorrect = actualDirection === prediction.direction;
  return updatePrediction(prediction.id, {
    actualDirection,
    isCorrect,
    resolvedAt: new Date().toISOString(),
    resolvedPrice: close.closePrice,
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
    res.status(502).json({ error: "종가를 가져오지 못했어요. 잠시 후 다시 시도해주세요." });
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
