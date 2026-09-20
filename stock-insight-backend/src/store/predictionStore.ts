import fs from "node:fs";
import path from "node:path";
import type { PredictionResult } from "../types.js";

// 프로토타입 단계: 실제 DB 대신 JSON 파일 영속화. 트래픽/동시성이 커지면 실제 DB로 교체 필요 (README TODO 참고).
const isTest = process.env.NODE_ENV === "test";
const dataDir = path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "predictions.json");

function loadFromDisk(): [string, PredictionResult][] {
  if (isTest || !fs.existsSync(dataFile)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(dataFile, "utf-8")) as PredictionResult[];
    return raw.map((p) => [p.id, p]);
  } catch {
    return [];
  }
}

const predictions = new Map<string, PredictionResult>(loadFromDisk());

function persist(): void {
  if (isTest) return;
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(Array.from(predictions.values()), null, 2));
}

export function savePrediction(prediction: PredictionResult): void {
  predictions.set(prediction.id, prediction);
  persist();
}

export function getPrediction(id: string): PredictionResult | undefined {
  return predictions.get(id);
}

export function listPredictions(): PredictionResult[] {
  return Array.from(predictions.values()).sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
  );
}

export function updatePrediction(
  id: string,
  patch: Partial<PredictionResult>
): PredictionResult | undefined {
  const existing = predictions.get(id);
  if (!existing) return undefined;
  const updated = { ...existing, ...patch };
  predictions.set(id, updated);
  persist();
  return updated;
}
