import { Router } from "express";
import { listPredictions } from "../store/predictionStore.js";
import { isMilestoneClaimed, claimMilestone } from "../store/streakBonusStore.js";
import { computeStreak, kstDateKey } from "../utils/streak.js";

export const streakRouter = Router();

const MILESTONE_EVERY = 3;
const BONUS_AMOUNT = 3;

function getStatus(userId: string, now: Date) {
  const { currentStreak, todayParticipated } = computeStreak(
    listPredictions()
      .filter((p) => p.userId === userId)
      .map((p) => p.submittedAt),
    now
  );
  const milestoneKey = `${userId}:${kstDateKey(now)}`;
  const bonusAvailable =
    todayParticipated &&
    currentStreak > 0 &&
    currentStreak % MILESTONE_EVERY === 0 &&
    !isMilestoneClaimed(milestoneKey);

  return { currentStreak, todayParticipated, milestoneKey, bonusAvailable };
}

streakRouter.get("/", (req, res) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) return res.status(400).json({ error: "userId is required" });

  const { currentStreak, todayParticipated, bonusAvailable } = getStatus(userId, new Date());
  res.json({
    currentStreak,
    todayParticipated,
    milestoneEvery: MILESTONE_EVERY,
    bonusAmount: BONUS_AMOUNT,
    bonusAvailable,
  });
});

streakRouter.post("/claim-bonus", (req, res) => {
  const { userId } = req.body as { userId?: string };
  if (!userId) return res.status(400).json({ error: "userId is required" });

  const { currentStreak, milestoneKey, bonusAvailable } = getStatus(userId, new Date());

  if (isMilestoneClaimed(milestoneKey)) {
    return res.status(400).json({ error: "이미 받은 보너스예요." });
  }
  if (!bonusAvailable) {
    return res.status(400).json({ error: "지금은 보너스를 받을 수 있는 시점이 아니에요." });
  }

  claimMilestone(milestoneKey);
  res.json({ claimed: true, streak: currentStreak, bonusAmount: BONUS_AMOUNT });
});
