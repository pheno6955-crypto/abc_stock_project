import { Router } from "express";
import { listPredictions } from "../store/predictionStore.js";
import { isMilestoneClaimed, claimMilestone } from "../store/streakBonusStore.js";
import { computeStreak, kstDateKey } from "../utils/streak.js";

export const streakRouter = Router();

const MILESTONE_EVERY = 3;
const BONUS_AMOUNT = 3;

function getStatus(now: Date) {
  const { currentStreak, todayParticipated } = computeStreak(
    listPredictions().map((p) => p.submittedAt),
    now
  );
  const todayKey = kstDateKey(now);
  const bonusAvailable =
    todayParticipated &&
    currentStreak > 0 &&
    currentStreak % MILESTONE_EVERY === 0 &&
    !isMilestoneClaimed(todayKey);

  return { currentStreak, todayParticipated, todayKey, bonusAvailable };
}

streakRouter.get("/", (_req, res) => {
  const { currentStreak, todayParticipated, bonusAvailable } = getStatus(new Date());
  res.json({
    currentStreak,
    todayParticipated,
    milestoneEvery: MILESTONE_EVERY,
    bonusAmount: BONUS_AMOUNT,
    bonusAvailable,
  });
});

streakRouter.post("/claim-bonus", (_req, res) => {
  const { currentStreak, todayKey, bonusAvailable } = getStatus(new Date());

  if (isMilestoneClaimed(todayKey)) {
    return res.status(400).json({ error: "이미 받은 보너스예요." });
  }
  if (!bonusAvailable) {
    return res.status(400).json({ error: "지금은 보너스를 받을 수 있는 시점이 아니에요." });
  }

  claimMilestone(todayKey);
  res.json({ claimed: true, streak: currentStreak, bonusAmount: BONUS_AMOUNT });
});
