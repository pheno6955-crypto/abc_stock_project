import "dotenv/config";
import os from "node:os";
import { createApp } from "./server.js";
import { startPredictionScheduler } from "./services/predictionScheduler.js";
import { warmStockIndex } from "./services/stockIndex.js";
import { dbEnabled, initDb } from "./store/db.js";
import { hydratePredictions } from "./store/predictionStore.js";
import { hydrateStreakBonuses } from "./store/streakBonusStore.js";
import { seedRankingDemo } from "./services/rankingDemoSeed.js";
import { normalizePendingReferencePrices } from "./services/referencePriceNormalizer.js";

function getLanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((iface): iface is NonNullable<typeof iface> => !!iface && iface.family === "IPv4" && !iface.internal)
    .map((iface) => iface.address);
}

async function main() {
  if (dbEnabled) {
    await initDb();
    await hydratePredictions();
    await hydrateStreakBonuses();
  } else {
    console.log("[db] DATABASE_URL 없음 - JSON 파일 저장소 사용 (재시작 시 데이터가 사라질 수 있음)");
  }

  try {
    const fixed = await normalizePendingReferencePrices();
    if (fixed > 0) console.log(`[normalize] 확정 대기 예측 ${fixed}건의 기준가를 정규장 종가로 보정`);
  } catch (err) {
    console.warn("[normalize] 기준가 보정 건너뜀:", (err as Error).message);
  }

  // 시연용: 랭킹 샘플을 부팅 시 현재 시각 기준으로 다시 채운다 (SEED_RANKING_DEMO_ON_BOOT=true 일 때만).
  if (process.env.SEED_RANKING_DEMO_ON_BOOT === "true") {
    const seeded = await seedRankingDemo();
    console.log(`[seed] 랭킹 샘플 ${seeded.created}건 준비 완료`);
  }

  const app = createApp();
  const port = Number(process.env.PORT) || 8787;
  const host = "0.0.0.0";
  app.listen(port, host, () => {
    console.log(`🚀 stock-insight-backend listening on http://0.0.0.0:${port}`);
    for (const address of getLanAddresses()) {
      console.log(`   팀원 접속 URL: http://${address}:${port}`);
    }
  });

  startPredictionScheduler();
  warmStockIndex();
}

main().catch((err) => {
  console.error("서버 시작 실패:", err);
  process.exit(1);
});
