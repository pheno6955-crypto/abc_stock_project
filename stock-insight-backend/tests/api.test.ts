import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

// 동적 import: NODE_ENV=test가 db.ts 평가(인메모리 DB 선택) 전에 반영되도록 함
process.env.NODE_ENV = "test";
const { createApp } = await import("../src/server.js");
const { updatePrediction } = await import("../src/store/predictionStore.js");

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

test("GET /api/stocks/:code/report reuses a cached result for repeat requests", async () => {
  const first = await request(app).get("/api/stocks/000660/report");
  const second = await request(app).get("/api/stocks/000660/report");
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  // 캐시가 없다면 매번 새 generatedAt이 찍히므로, 두 번째 호출이 첫 번째와 완전히 같다면 캐시가 재사용된 것.
  assert.equal(first.body.generatedAt, second.body.generatedAt);
});

test("GET /api/stocks/:code/report dedupes concurrent requests for the same never-before-seen code", async () => {
  // 프리페치와 실제 화면 진입이 거의 동시에 들어오는 상황을 흉내낸다 (카카오는 이 테스트 파일에서 아직 조회된 적 없음).
  const [first, second] = await Promise.all([
    request(app).get("/api/stocks/035720/report"),
    request(app).get("/api/stocks/035720/report"),
  ]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  // 하나의 계산을 같이 기다린 거라면 generatedAt이 완전히 같아야 한다 (Claude가 2번 안 불렸다는 증거).
  assert.equal(first.body.generatedAt, second.body.generatedAt);
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
  const res = await request(app).get("/api/stocks/categories/1/stocks"); // id 1 = 반도체
  assert.equal(res.status, 200);
  assert.ok(res.body.length > 0);
  // 반도체 업종 시총 1위는 삼성전자(보통주/우선주 중 하나)여야 함 (실데이터 기반 검증)
  assert.ok(["005930", "005935"].includes(res.body[0].code));
  // 시가총액 내림차순 정렬 검증
  for (let i = 1; i < res.body.length; i++) {
    assert.ok(res.body[i - 1].marketValue >= res.body[i].marketValue);
  }
});

test("GET /api/stocks/categories/:id/stocks merges multiple industries and re-sorts by market cap", async () => {
  const res = await request(app).get("/api/stocks/categories/5/stocks"); // id 5 = IT·게임 (두 업종 통합)
  assert.equal(res.status, 200);
  assert.ok(res.body.length > 0);
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
    .send({ code: "005930", stockName: "삼성전자", direction: "SIDEWAYS", userId: "test-user" });
  assert.equal(res.status, 400);
});

test("POST /api/predictions rejects missing userId", async () => {
  const res = await request(app)
    .post("/api/predictions")
    .send({ code: "005930", stockName: "삼성전자", direction: "UP" });
  assert.equal(res.status, 400);
});

test("prediction submit sets a future resolvableAt and refuses early resolve", async () => {
  const submitRes = await request(app)
    .post("/api/predictions")
    .send({ code: "005930", stockName: "삼성전자", direction: "UP", userId: "test-user" });
  assert.equal(submitRes.status, 201);
  assert.equal(submitRes.body.userId, "test-user");
  assert.equal(submitRes.body.isCorrect, null);
  assert.equal(typeof submitRes.body.referencePrice, "number");
  assert.ok(new Date(submitRes.body.resolvableAt).getTime() > Date.now());

  // 다음 거래일 종가 확정 전이므로 즉시 판정 시도는 거절되어야 한다.
  const earlyResolveRes = await request(app).post(`/api/predictions/${submitRes.body.id}/resolve`);
  assert.equal(earlyResolveRes.status, 400);
  assert.match(earlyResolveRes.body.error, /판정 시점이 아니에요/);
});

test("prediction resolve -> claim-reward flow once resolvableAt has passed (real Naver price)", async () => {
  const submitRes = await request(app)
    .post("/api/predictions")
    .send({ code: "005930", stockName: "삼성전자", direction: "UP", userId: "test-user" });
  assert.equal(submitRes.status, 201);

  // resolvableAt을 과거로 앞당겨, 다음 거래일 종가 확정 이후 상황을 시뮬레이션한다.
  updatePrediction(submitRes.body.id, { resolvableAt: new Date(Date.now() - 1000).toISOString() });

  // 실데이터 기반이라 결과 방향은 UP/DOWN 둘 다 나올 수 있어 두 경우 모두 검증한다.
  const resolveRes = await request(app).post(`/api/predictions/${submitRes.body.id}/resolve`);
  assert.equal(resolveRes.status, 200);
  assert.ok(["UP", "DOWN"].includes(resolveRes.body.actualDirection));
  assert.equal(typeof resolveRes.body.isCorrect, "boolean");

  const doubleResolveRes = await request(app).post(`/api/predictions/${submitRes.body.id}/resolve`);
  assert.equal(doubleResolveRes.status, 400);

  const listRes = await request(app).get("/api/predictions");
  assert.ok(listRes.body.some((p: { id: string }) => p.id === submitRes.body.id));

  const filteredListRes = await request(app).get("/api/predictions").query({ userId: "test-user" });
  assert.ok(filteredListRes.body.every((p: { userId: string }) => p.userId === "test-user"));
  assert.ok(filteredListRes.body.some((p: { id: string }) => p.id === submitRes.body.id));

  const otherUserListRes = await request(app).get("/api/predictions").query({ userId: "someone-else" });
  assert.ok(!otherUserListRes.body.some((p: { id: string }) => p.id === submitRes.body.id));

  const claimRes = await request(app).post(`/api/predictions/${submitRes.body.id}/claim-reward`);
  if (resolveRes.body.isCorrect) {
    assert.equal(claimRes.status, 200);
    assert.equal(claimRes.body.rewardClaimed, true);
  } else {
    assert.equal(claimRes.status, 400);
  }
});

test("POST /api/predictions/resolve-pending only resolves predictions past resolvableAt", async () => {
  const notYetRes = await request(app)
    .post("/api/predictions")
    .send({ code: "000660", stockName: "SK하이닉스", direction: "DOWN", userId: "test-user" });
  assert.equal(notYetRes.status, 201);

  const dueRes = await request(app)
    .post("/api/predictions")
    .send({ code: "000660", stockName: "SK하이닉스", direction: "DOWN", userId: "test-user" });
  assert.equal(dueRes.status, 201);
  updatePrediction(dueRes.body.id, { resolvableAt: new Date(Date.now() - 1000).toISOString() });

  const batchRes = await request(app).post("/api/predictions/resolve-pending");
  assert.equal(batchRes.status, 200);
  assert.ok(batchRes.body.results.some((p: { id: string }) => p.id === dueRes.body.id));
  assert.ok(!batchRes.body.results.some((p: { id: string }) => p.id === notYetRes.body.id));

  const afterListRes = await request(app).get("/api/predictions");
  const due = afterListRes.body.find((p: { id: string }) => p.id === dueRes.body.id);
  const notYet = afterListRes.body.find((p: { id: string }) => p.id === notYetRes.body.id);
  assert.ok(due.resolvedAt !== null);
  assert.ok(notYet.resolvedAt === null);
});

test("computeStreak counts consecutive KST days and stops at a gap", async () => {
  const { computeStreak } = await import("../src/utils/streak.js");
  const DAY_MS = 24 * 60 * 60 * 1000;
  const now = new Date("2026-09-24T05:00:00.000Z"); // 2026-09-24 14:00 KST
  const iso = (daysAgo: number) => new Date(now.getTime() - daysAgo * DAY_MS).toISOString();

  assert.deepEqual(computeStreak([iso(0), iso(1), iso(2)], now), {
    currentStreak: 3,
    todayParticipated: true,
  });

  // 오늘 미참여 시: 어제까지의 스트릭은 유지해서 보여주되 todayParticipated만 false
  assert.deepEqual(computeStreak([iso(1), iso(2)], now), {
    currentStreak: 2,
    todayParticipated: false,
  });

  // 어제 하루가 비어 있으면(오늘, 그제만 참여) 스트릭은 오늘 하루로 끊긴다
  assert.deepEqual(computeStreak([iso(0), iso(2)], now), {
    currentStreak: 1,
    todayParticipated: true,
  });

  assert.deepEqual(computeStreak([], now), { currentStreak: 0, todayParticipated: false });
});

test("GET /api/streak requires userId and returns a well-formed status", async () => {
  const missingRes = await request(app).get("/api/streak");
  assert.equal(missingRes.status, 400);

  const res = await request(app).get("/api/streak").query({ userId: "streak-test-user" });
  assert.equal(res.status, 200);
  assert.equal(typeof res.body.currentStreak, "number");
  assert.equal(typeof res.body.todayParticipated, "boolean");
  assert.equal(res.body.milestoneEvery, 3);
  assert.equal(typeof res.body.bonusAvailable, "boolean");
});

test("POST /api/streak/claim-bonus rejects a second consecutive attempt regardless of prior state", async () => {
  const userId = `streak-claim-test-${Date.now()}`;
  const first = await request(app).post("/api/streak/claim-bonus").send({ userId });
  const second = await request(app).post("/api/streak/claim-bonus").send({ userId });
  assert.ok([200, 400].includes(first.status));
  assert.equal(second.status, 400);
});

test("streak and bonus claims are independent per user", async () => {
  const submit = async (userId: string) =>
    request(app)
      .post("/api/predictions")
      .send({ code: "005930", stockName: "삼성전자", direction: "UP", userId });

  const userA = `streak-user-a-${Date.now()}`;
  const userB = `streak-user-b-${Date.now()}`;

  await submit(userA);
  await submit(userB);

  const statusA = await request(app).get("/api/streak").query({ userId: userA });
  const statusB = await request(app).get("/api/streak").query({ userId: userB });
  assert.equal(statusA.body.currentStreak, 1);
  assert.equal(statusB.body.currentStreak, 1);

  // A가 자기 자리(1일차)에서는 3일 마일스톤에 못 미치므로 보너스 클레임은 거절돼야 하고,
  // 이 거절이 B의 상태에 영향을 주지 않아야 한다(완전히 독립적).
  const claimA = await request(app).post("/api/streak/claim-bonus").send({ userId: userA });
  assert.equal(claimA.status, 400);

  const statusBAfter = await request(app).get("/api/streak").query({ userId: userB });
  assert.equal(statusBAfter.body.currentStreak, 1);
  assert.equal(statusBAfter.body.bonusAvailable, false);
});

test("periodStart computes correct week/month boundaries in KST", async () => {
  const { periodStart } = await import("../src/utils/period.js");
  const { kstDateKey } = await import("../src/utils/streak.js");

  // 2026-09-26 22:00 KST는 토요일이다.
  const now = new Date("2026-09-26T13:00:00.000Z");
  assert.equal(kstDateKey(periodStart("week", now)), "2026-09-21"); // 그 주 월요일
  assert.equal(kstDateKey(periodStart("month", now)), "2026-09-01"); // 이번 달 1일

  const weekStartKst = new Date(periodStart("week", now).getTime() + 9 * 60 * 60 * 1000);
  assert.equal(weekStartKst.getUTCHours(), 0);
  assert.equal(weekStartKst.getUTCMinutes(), 0);
});

test("GET /api/rankings ranks users by hits then accuracy within the period", async () => {
  const submitAndResolve = async (userId: string, isCorrect: boolean) => {
    const submitRes = await request(app)
      .post("/api/predictions")
      .send({ code: "005930", stockName: "삼성전자", direction: "UP", userId });
    updatePrediction(submitRes.body.id, {
      resolvedAt: new Date().toISOString(),
      isCorrect,
      actualDirection: isCorrect ? "UP" : "DOWN",
    });
  };

  const me = `rank-test-${Date.now()}`;
  const other = `rank-test-other-${Date.now()}`;

  await submitAndResolve(me, true);
  await submitAndResolve(me, true);
  await submitAndResolve(other, true);

  const res = await request(app).get("/api/rankings").query({ period: "week", userId: me });
  assert.equal(res.status, 200);
  assert.equal(res.body.me.hits, 2);
  assert.equal(res.body.me.attempts, 2);
  assert.equal(res.body.me.accuracy, 1);

  const mine = res.body.entries.find((e: { isMe: boolean }) => e.isMe);
  assert.ok(mine, "내 기록이 랭킹 목록에 있어야 함");
  assert.equal(mine.hits, 2);

  const otherEntry = res.body.entries.find((e: { hits: number; isMe: boolean }) => !e.isMe && e.hits === 1);
  // 2승인 me가 1승인 other보다 순위가 앞서야 한다 (적중 횟수 우선 정렬)
  if (otherEntry) assert.ok(mine.rank < otherEntry.rank);
});
