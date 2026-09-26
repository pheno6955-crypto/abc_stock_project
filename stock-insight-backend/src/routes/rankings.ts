import { Router } from "express";
import type { RankingEntry } from "../types.js";
import { listPredictions } from "../store/predictionStore.js";
import { periodStart, type RankingPeriod } from "../utils/period.js";

export const rankingsRouter = Router();

const TOP_N = 10;

interface UserStats {
  userId: string;
  hits: number;
  attempts: number;
  accuracy: number;
}

// 적중 횟수 우선, 동률이면 적중률로 2차 정렬 — 많이 참여할수록 유리하게 해서 참여 유도.
function compareStats(a: UserStats, b: UserStats): number {
  return b.hits - a.hits || b.accuracy - a.accuracy;
}

rankingsRouter.get("/", (req, res) => {
  const period: RankingPeriod = req.query.period === "month" ? "month" : "week";
  const myUserId = typeof req.query.userId === "string" ? req.query.userId : undefined;
  const start = periodStart(period).getTime();

  const statsByUser = new Map<string, { hits: number; attempts: number }>();
  for (const p of listPredictions()) {
    if (!p.userId || p.resolvedAt === null) continue;
    if (new Date(p.submittedAt).getTime() < start) continue;
    const s = statsByUser.get(p.userId) ?? { hits: 0, attempts: 0 };
    s.attempts += 1;
    if (p.isCorrect) s.hits += 1;
    statsByUser.set(p.userId, s);
  }

  const ranked: UserStats[] = Array.from(statsByUser.entries())
    .map(([userId, s]) => ({ userId, hits: s.hits, attempts: s.attempts, accuracy: s.attempts > 0 ? s.hits / s.attempts : 0 }))
    .sort(compareStats);

  // TODO(실서비스 전환 시 필수): userId를 그대로 노출하면 실제 NH 회원 식별자가 다른 사용자에게
  // 그대로 보이게 됨. 지금은 로그인/닉네임 체계가 없는 프로토타입 단계라 그대로 내려주지만,
  // 실 서비스에서는 반드시 별도 닉네임/마스킹 처리 후 내려줘야 함.
  const entries: RankingEntry[] = ranked.slice(0, TOP_N).map((r, i) => ({
    rank: i + 1,
    userId: r.userId,
    isMe: r.userId === myUserId,
    hits: r.hits,
    attempts: r.attempts,
    accuracy: r.accuracy,
  }));

  let me: RankingEntry | null = null;
  if (myUserId) {
    const idx = ranked.findIndex((r) => r.userId === myUserId);
    if (idx >= 0) {
      const r = ranked[idx];
      me = { rank: idx + 1, userId: r.userId, isMe: true, hits: r.hits, attempts: r.attempts, accuracy: r.accuracy };
    }
  }

  res.json({ period, periodStart: new Date(start).toISOString(), entries, me });
});
