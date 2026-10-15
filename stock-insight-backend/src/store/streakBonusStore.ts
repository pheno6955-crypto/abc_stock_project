import fs from "node:fs";
import path from "node:path";
import { dbEnabled, enqueueWrite, query } from "./db.js";

// 마일스톤 키는 "userId:날짜" 형식으로 저장해서, 사람마다 독립적으로 보너스를 받을 수 있게 한다.
// DATABASE_URL이 있으면 Postgres에, 없으면 JSON 파일(로컬 개발용)에 저장한다 (predictionStore.ts와 동일한 방식).
const isTest = process.env.NODE_ENV === "test";
const dataDir = path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "streakBonuses.json");

function loadFromDisk(): string[] {
  if (isTest || dbEnabled || !fs.existsSync(dataFile)) return [];
  try {
    return JSON.parse(fs.readFileSync(dataFile, "utf-8")) as string[];
  } catch {
    return [];
  }
}

const claimedMilestones = new Set<string>(loadFromDisk());

export async function hydrateStreakBonuses(): Promise<void> {
  if (!dbEnabled) return;
  const { rows } = await query<{ milestone_key: string }>("SELECT milestone_key FROM streak_bonuses");
  for (const row of rows) claimedMilestones.add(row.milestone_key);
}

function persistFile(): void {
  if (isTest || dbEnabled) return;
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(Array.from(claimedMilestones), null, 2));
}

export function isMilestoneClaimed(milestoneKey: string): boolean {
  return claimedMilestones.has(milestoneKey);
}

export function claimMilestone(milestoneKey: string): void {
  claimedMilestones.add(milestoneKey);
  if (dbEnabled) {
    enqueueWrite("streak bonus insert", () =>
      query("INSERT INTO streak_bonuses (milestone_key) VALUES ($1) ON CONFLICT DO NOTHING", [milestoneKey])
    );
  } else {
    persistFile();
  }
}
