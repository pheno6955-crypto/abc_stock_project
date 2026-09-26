import fs from "node:fs";
import path from "node:path";

// 프로토타입 단계: 실제 DB 대신 JSON 파일 영속화 (predictionStore.ts와 동일한 방식).
// 마일스톤 키는 "userId:날짜" 형식으로 저장해서, 사람마다 독립적으로 보너스를 받을 수 있게 한다.
const isTest = process.env.NODE_ENV === "test";
const dataDir = path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "streakBonuses.json");

function loadFromDisk(): string[] {
  if (isTest || !fs.existsSync(dataFile)) return [];
  try {
    return JSON.parse(fs.readFileSync(dataFile, "utf-8")) as string[];
  } catch {
    return [];
  }
}

const claimedMilestones = new Set<string>(loadFromDisk());

function persist(): void {
  if (isTest) return;
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(Array.from(claimedMilestones), null, 2));
}

export function isMilestoneClaimed(milestoneKey: string): boolean {
  return claimedMilestones.has(milestoneKey);
}

export function claimMilestone(milestoneKey: string): void {
  claimedMilestones.add(milestoneKey);
  persist();
}
