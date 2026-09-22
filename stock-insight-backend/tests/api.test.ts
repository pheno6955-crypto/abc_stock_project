import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

// 동적 import: NODE_ENV=test가 db.ts 평가(인메모리 DB 선택) 전에 반영되도록 함
process.env.NODE_ENV = "test";
const { createApp } = await import("../src/server.js");

const app = createApp();

test("GET /health returns ok", async () => {
  const res = await request(app).get("/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
});

test("GET /api/stocks/search returns matching stocks", async () => {
  const res = await request(app).get("/api/stocks/search?q=삼성");
  assert.equal(res.status, 200);
  assert.ok(res.body.some((s: { code: string }) => s.code === "005930"));
});

test("GET /api/stocks/:code/report returns a report (mock, no API key)", async () => {
  const res = await request(app).get("/api/stocks/005930/report");
  assert.equal(res.status, 200);
  assert.equal(res.body.code, "005930");
  assert.ok(typeof res.body.summary === "string");
});

test("GET /api/stocks/:code/report 404s for unknown code", async () => {
  const res = await request(app).get("/api/stocks/999999/report");
  assert.equal(res.status, 404);
});

test("GET /api/stocks/categories returns a fixed category list", async () => {
  const res = await request(app).get("/api/stocks/categories");
  assert.equal(res.status, 200);
  assert.ok(res.body.some((c: { label: string }) => c.label === "반도체"));
});

test("GET /api/stocks/categories/:id/stocks returns market-cap sorted real stocks", async () => {
  const res = await request(app).get("/api/stocks/categories/278/stocks");
  assert.equal(res.status, 200);
  assert.ok(res.body.length > 0);
  // 반도체 업종 시총 1위는 삼성전자(보통주/우선주 중 하나)여야 함 (실데이터 기반 검증)
  assert.ok(["005930", "005935"].includes(res.body[0].code));
  // 시가총액 내림차순 정렬 검증
  for (let i = 1; i < res.body.length; i++) {
    assert.ok(res.body[i - 1].marketValue >= res.body[i].marketValue);
  }
});

test("GET /api/stocks/categories/:id/stocks 404s for unknown category", async () => {
  const res = await request(app).get("/api/stocks/categories/999999/stocks");
  assert.equal(res.status, 404);
});

test("POST /api/stocks/:code/chat rejects empty messages", async () => {
  const res = await request(app).post("/api/stocks/005930/chat").send({ messages: [] });
  assert.equal(res.status, 400);
});

test("POST /api/stocks/:code/chat 404s for unknown code", async () => {
  const res = await request(app)
    .post("/api/stocks/999999/chat")
    .send({ messages: [{ role: "user", content: "PER이 뭐야?" }] });
  assert.equal(res.status, 404);
});

test("POST /api/stocks/:code/chat replies with glossary answer (mock, no API key)", async () => {
  const res = await request(app)
    .post("/api/stocks/005930/chat")
    .send({ messages: [{ role: "user", content: "PER이 뭐야?" }] });
  assert.equal(res.status, 200);
  assert.match(res.body.reply, /^\[PER\]/);
});

test("POST /api/stocks/:code/chat falls back to guide reply for unknown terms (mock)", async () => {
  const res = await request(app)
    .post("/api/stocks/005930/chat")
    .send({ messages: [{ role: "user", content: "오늘 날씨 어때?" }] });
  assert.equal(res.status, 200);
  assert.match(res.body.reply, /AI가 설정되어 있지 않아/);
});

test("POST /api/predictions rejects invalid direction", async () => {
  const res = await request(app)
    .post("/api/predictions")
    .send({ code: "005930", stockName: "삼성전자", direction: "SIDEWAYS" });
  assert.equal(res.status, 400);
});

test("prediction submit -> resolve -> list -> claim-reward flow (real Naver price)", async () => {
  const submitRes = await request(app)
    .post("/api/predictions")
    .send({ code: "005930", stockName: "삼성전자", direction: "UP" });
  assert.equal(submitRes.status, 201);
  assert.equal(submitRes.body.isCorrect, null);
  assert.equal(typeof submitRes.body.referencePrice, "number");

  // 제출과 판정 사이에 실제 가격이 거의 움직이지 않으므로 UP(동률 포함)으로 판정될 가능성이 높지만,
  // 실데이터라 100% 보장은 안 되므로 두 경우 모두 검증한다.
  const resolveRes = await request(app).post(`/api/predictions/${submitRes.body.id}/resolve`);
  assert.equal(resolveRes.status, 200);
  assert.ok(["UP", "DOWN"].includes(resolveRes.body.actualDirection));
  assert.equal(typeof resolveRes.body.isCorrect, "boolean");

  const doubleResolveRes = await request(app).post(`/api/predictions/${submitRes.body.id}/resolve`);
  assert.equal(doubleResolveRes.status, 400);

  const listRes = await request(app).get("/api/predictions");
  assert.ok(listRes.body.some((p: { id: string }) => p.id === submitRes.body.id));

  const claimRes = await request(app).post(`/api/predictions/${submitRes.body.id}/claim-reward`);
  if (resolveRes.body.isCorrect) {
    assert.equal(claimRes.status, 200);
    assert.equal(claimRes.body.rewardClaimed, true);
  } else {
    assert.equal(claimRes.status, 400);
  }
});

test("POST /api/predictions/resolve-pending resolves all unresolved predictions", async () => {
  const submitRes = await request(app)
    .post("/api/predictions")
    .send({ code: "000660", stockName: "SK하이닉스", direction: "DOWN" });
  assert.equal(submitRes.status, 201);

  const batchRes = await request(app).post("/api/predictions/resolve-pending");
  assert.equal(batchRes.status, 200);
  assert.ok(batchRes.body.resolved >= 1);
  assert.ok(
    batchRes.body.results.some((p: { id: string }) => p.id === submitRes.body.id)
  );

  const afterListRes = await request(app).get("/api/predictions");
  const found = afterListRes.body.find((p: { id: string }) => p.id === submitRes.body.id);
  assert.ok(found.resolvedAt !== null);
});
