import type { PredictionDirection, PredictionResult } from "../types.js";
import { deletePredictionsByIdPrefix, savePrediction } from "../store/predictionStore.js";

// 랭킹 화면 시연용 샘플 데이터. 실제 사람 이름 대신 guest- 접두사를 써서, 프론트의 랭킹 화면이
// 실제 게스트와 동일하게 유명 축구선수 이름으로 표시되도록 한다.
// TODO: 실서비스 전환 시 제거할 것 (테스트/시연 전용).
const RANKING_DEMO_USERS: { userId: string; results: boolean[] }[] = [
  { userId: "guest-demoseed01", results: [true, true, true, true, false] }, // 5전 4승 1패
  { userId: "guest-demoseed02", results: [true, true, true, false] }, // 4전 3승 1패
  { userId: "guest-demoseed03", results: [true, true, false] }, // 3전 2승 1패
  { userId: "guest-demoseed04", results: [true, false] }, // 2전 1승 1패
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

export const RANKING_DEMO_ID_PREFIX = "rank-demo-";

// 샘플을 지우고 현재 시각 기준으로 다시 만든다. 랭킹이 "이번 주/이번 달" 기준이라, 날짜가 오래되면 화면에서 빠지기 때문에
// 부팅할 때마다 새로 만들면 항상 보인다. 여러 번 호출해도 카드가 쌓이지 않는다.
export async function seedRankingDemo(
  priceFor: (code: string) => Promise<number> = async () => 50000
): Promise<{ created: number; users: string[] }> {
  deletePredictionsByIdPrefix(RANKING_DEMO_ID_PREFIX);

  const now = Date.now();
  const STEP_MS = 5 * 60 * 1000;
  let poolIndex = 0;
  let created = 0;

  for (const user of RANKING_DEMO_USERS) {
    for (const [i, hit] of user.results.entries()) {
      const stock = RANKING_DEMO_STOCK_POOL[poolIndex % RANKING_DEMO_STOCK_POOL.length];
      poolIndex += 1;
      const direction: PredictionDirection = i % 2 === 0 ? "UP" : "DOWN";
      const actualDirection: PredictionDirection = hit ? direction : direction === "UP" ? "DOWN" : "UP";
      const referencePrice = await priceFor(stock.code);
      const prediction: PredictionResult = {
        id: `${RANKING_DEMO_ID_PREFIX}${user.userId}-${stock.code}-${i}`,
        userId: user.userId,
        code: stock.code,
        stockName: stock.stockName,
        direction,
        referencePrice,
        actualDirection,
        isCorrect: hit,
        rewardClaimed: hit,
        submittedAt: new Date(now - (i + 3) * STEP_MS).toISOString(),
        resolvableAt: new Date(now - (i + 2) * STEP_MS).toISOString(),
        resolvedAt: new Date(now - (i + 1) * STEP_MS).toISOString(),
      };
      savePrediction(prediction);
      created += 1;
    }
  }

  return { created, users: RANKING_DEMO_USERS.map((u) => u.userId) };
}
