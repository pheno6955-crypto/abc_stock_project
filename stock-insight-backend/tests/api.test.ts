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

test("GET /api/stocks/search matches the middle of a name ('전자' finds 삼성전자)", async () => {
  const res = await request(app).get(`/api/stocks/search?q=${encodeURIComponent("전자")}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.some((s: { code: string }) => s.code === "005930"));
});

test("GET /api/stocks/search still finds ETFs (TIGER, KODEX) and matches mid-name", async () => {
  for (const q of ["tiger", "KODEX", "미국"]) {
    const res = await request(app).get(`/api/stocks/search?q=${encodeURIComponent(q)}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.length > 0, `${q}: no results`);
  }
  const res = await request(app).get("/api/stocks/search?q=tiger");
  assert.ok(res.body.some((s: { name: string }) => /^TIGER/i.test(s.name)));
});

test("GET /api/stocks/:code/metrics returns real valuation metrics (실데이터)", async () => {
  const res = await request(app).get("/api/stocks/005930/metrics");
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.length > 0);
  const byLabel = new Map(res.body.map((m: { label: string; value: string }) => [m.label, m.value]));
  assert.ok(byLabel.has("PER"));
  assert.ok(byLabel.has("시가총액"));
  for (const m of res.body as { label: string; value: string }[]) {
    assert.equal(typeof m.label, "string");
    assert.equal(typeof m.value, "string");
    assert.ok(m.value.length > 0);
    assert.ok(!m.value.includes("\n"), `${m.label} 값이 여러 줄이면 안 됨: ${m.value}`);
  }
  // 금액류(시가총액/EPS/BPS)는 상세 금액 대신 한 줄짜리 대략적인 금액("약 N조원"/"약 N.N만원")으로 나와야 함
  assert.match(byLabel.get("시가총액")!, /^약 [\d,.]+(조원|억원)$/);
  if (byLabel.has("EPS")) assert.match(byLabel.get("EPS")!, /^(약 [\d.]+(만원|억원)|[\d,]+원)$/);
  if (byLabel.has("BPS")) assert.match(byLabel.get("BPS")!, /^(약 [\d.]+(만원|억원)|[\d,]+원)$/);
});

test("GET /api/stocks/:code/metrics returns ETF-specific metrics (NAV/수익률 등, PER 없음)", async () => {
  const res = await request(app).get("/api/stocks/0183J0/metrics"); // TIGER 미국우주테크 (ETF)
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.length > 0);
  const byLabel = new Map(res.body.map((m: { label: string; value: string }) => [m.label, m.value]));
  assert.ok(byLabel.has("NAV"));
  assert.ok(!byLabel.has("PER")); // ETF는 개별 기업 지표(PER/PBR/EPS 등)가 없음
  for (const m of res.body as { label: string; value: string }[]) {
    assert.ok(m.value.length > 0);
    assert.ok(!m.value.includes("\n"));
  }
  // NAV/52주 최고/최저도 주식의 EPS/BPS처럼 상세 금액 대신 대략적인 한 줄 금액으로 나와야 함
  const approxWonPattern = /^(약 [\d.]+(만원|억원)|[\d,.]+원)$/;
  assert.match(byLabel.get("NAV")!, approxWonPattern);
  if (byLabel.has("52주 최고")) assert.match(byLabel.get("52주 최고")!, approxWonPattern);
  if (byLabel.has("52주 최저")) assert.match(byLabel.get("52주 최저")!, approxWonPattern);
});

test("GET /api/stocks/:code/metrics 404s for an unknown stock code", async () => {
  const res = await request(app).get("/api/stocks/000000/metrics");
  assert.equal(res.status, 404);
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

test("POST /api/stocks/recent-prices refreshes prices for given code/name/market items", async () => {
  const res = await request(app)
    .post("/api/stocks/recent-prices")
    .send({ items: [{ code: "005930", name: "삼성전자", market: "KOSPI" }] });
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].code, "005930");
  assert.equal(typeof res.body[0].closePrice, "number");
});

test("POST /api/stocks/recent-prices ignores malformed entries and returns [] for empty input", async () => {
  const empty = await request(app).post("/api/stocks/recent-prices").send({ items: [] });
  assert.deepEqual(empty.body, []);

  const malformed = await request(app)
    .post("/api/stocks/recent-prices")
    .send({ items: [{ code: "005930" }, null, "oops"] });
  assert.equal(malformed.status, 200);
  assert.equal(malformed.body.length, 0);
});

test("POST /api/stocks/recent-prices requires items to be an array", async () => {
  const res = await request(app).post("/api/stocks/recent-prices").send({});
  assert.equal(res.status, 400);
});

test("GET /api/stocks/categories includes ETF and its stocks are top ETFs by market cap", async () => {
  const cats = await request(app).get("/api/stocks/categories");
  const etf = cats.body.find((c: { label: string }) => c.label === "ETF");
  assert.ok(etf, "ETF category missing");

  const res = await request(app).get(`/api/stocks/categories/${etf.id}/stocks`);
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 10);
  for (let i = 1; i < res.body.length; i++) {
    assert.ok(res.body[i - 1].marketValue >= res.body[i].marketValue);
  }
  // ETF만 나오는지: 삼성전자 같은 일반 주식이 섞이면 안 됨
  assert.ok(!res.body.some((s: { code: string }) => s.code === "005930"));
});

test("GET /api/stocks/search with empty query returns 10 popular stocks", async () => {
  const res = await request(app).get("/api/stocks/search");
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 10);
});

test("카테고리 칩은 ETF가 인기 종목 바로 옆(첫 번째)이고, 모든 카테고리가 10개씩 종목을 돌려준다", async () => {
  const cats = await request(app).get("/api/stocks/categories");
  assert.equal(cats.body[0].label, "ETF");

  for (const c of cats.body as { id: number; label: string }[]) {
    const res = await request(app).get(`/api/stocks/categories/${c.id}/stocks`);
    assert.equal(res.status, 200, c.label);
    assert.equal(res.body.length, 10, `${c.label}: expected 10 stocks`);
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

test("같은 종목에 미확정 예측이 있으면 올리/내리 어느 쪽이든 추가 예측이 거절된다", async () => {
  const userId = `dup-test-${Date.now()}`;
  const body = { code: "005930", stockName: "삼성전자", userId };

  const first = await request(app).post("/api/predictions").send({ ...body, direction: "UP" });
  assert.equal(first.status, 201);

  const sameDirection = await request(app).post("/api/predictions").send({ ...body, direction: "UP" });
  assert.equal(sameDirection.status, 409);
  const oppositeDirection = await request(app).post("/api/predictions").send({ ...body, direction: "DOWN" });
  assert.equal(oppositeDirection.status, 409);
  assert.match(oppositeDirection.body.error, /이미 이 종목에 예측을 제출했어요/);

  const list = await request(app).get("/api/predictions").query({ userId });
  assert.equal(list.body.length, 1);

  // 다른 종목, 다른 사용자는 영향받지 않는다
  const otherStock = await request(app)
    .post("/api/predictions")
    .send({ code: "000660", stockName: "SK하이닉스", userId, direction: "DOWN" });
  assert.equal(otherStock.status, 201);
  const otherUser = await request(app)
    .post("/api/predictions")
    .send({ ...body, userId: `${userId}-other`, direction: "DOWN" });
  assert.equal(otherUser.status, 201);
});

test("동시에 같은 종목을 올리/내리로 제출해도 한 건만 저장된다", async () => {
  const userId = `race-test-${Date.now()}`;
  const send = (direction: string) =>
    request(app).post("/api/predictions").send({ code: "005930", stockName: "삼성전자", userId, direction });
  const results = await Promise.all([send("UP"), send("DOWN"), send("UP")]);

  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 2);
  const list = await request(app).get("/api/predictions").query({ userId });
  assert.equal(list.body.length, 1);
});

test("예측이 확정(판정)된 뒤에는 같은 종목에 다시 예측할 수 있다", async () => {
  const userId = `again-test-${Date.now()}`;
  const body = { code: "005930", stockName: "삼성전자", userId, direction: "UP" };

  const first = await request(app).post("/api/predictions").send(body);
  assert.equal(first.status, 201);
  updatePrediction(first.body.id, { resolvableAt: new Date(Date.now() - 1000).toISOString() });
  const resolved = await request(app).post(`/api/predictions/${first.body.id}/resolve`);
  assert.equal(resolved.status, 200);

  const second = await request(app).post("/api/predictions").send({ ...body, direction: "DOWN" });
  assert.equal(second.status, 201);
});

test("prediction resolve -> claim-reward flow once resolvableAt has passed (real Naver price)", async () => {
  // 같은 사용자·종목의 미확정 예측은 중복 불가라, 위 테스트(삼성전자)와 다른 종목을 사용한다.
  const submitRes = await request(app)
    .post("/api/predictions")
    .send({ code: "035420", stockName: "NAVER", direction: "UP", userId: "test-user" });
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
    .send({ code: "005380", stockName: "현대차", direction: "DOWN", userId: "test-user" });
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

test("POST /api/predictions/seed-demo creates hit/miss/pending example predictions for the given user", async () => {
  const userId = `seed-test-${Date.now()}`;
  const res = await request(app).post("/api/predictions/seed-demo").send({ userId });
  assert.equal(res.status, 201);
  assert.ok(res.body.created >= 3);

  const list = await request(app).get("/api/predictions").query({ userId });
  const statuses = list.body.map((p: { resolvedAt: string | null; isCorrect: boolean | null }) =>
    p.resolvedAt === null ? "pending" : p.isCorrect ? "hit" : "miss"
  );
  assert.ok(statuses.includes("hit"), "적중 예시가 있어야 함");
  assert.ok(statuses.includes("miss"), "미적중 예시가 있어야 함");
  assert.ok(statuses.includes("pending"), "확정 대기 예시가 있어야 함");
  for (const p of list.body as { referencePrice: number; userId: string }[]) {
    assert.equal(p.userId, userId);
    assert.equal(typeof p.referencePrice, "number");
  }
});

test("POST /api/predictions/seed-demo requires a userId", async () => {
  const res = await request(app).post("/api/predictions/seed-demo").send({});
  assert.equal(res.status, 400);
});

test("POST /api/predictions/seed-ranking-demo seeds named users in hits-descending order for the ranking", async () => {
  const res = await request(app).post("/api/predictions/seed-ranking-demo").send({});
  assert.equal(res.status, 201);
  assert.ok(res.body.created > 0);
  assert.deepEqual(res.body.users, ["하현석", "조윤신", "김태영", "여효주"]);

  const ranking = await request(app).get("/api/rankings").query({ period: "week" });
  assert.equal(ranking.status, 200);
  const byName = new Map<string, { userId: string; hits: number; attempts: number }>(
    ranking.body.entries.map((e: { userId: string; hits: number; attempts: number }) => [e.userId, e])
  );
  assert.equal(byName.get("하현석")!.hits, 4);
  assert.equal(byName.get("하현석")!.attempts, 5);
  assert.equal(byName.get("조윤신")!.hits, 3);
  assert.equal(byName.get("김태영")!.hits, 2);
  assert.equal(byName.get("여효주")!.hits, 1);

  // 적중 횟수 내림차순으로 랭킹에 나와야 함
  const order = ranking.body.entries.map((e: { userId: string }) => e.userId);
  const idx = (name: string) => order.indexOf(name);
  assert.ok(idx("하현석") < idx("조윤신"));
  assert.ok(idx("조윤신") < idx("김태영"));
  assert.ok(idx("김태영") < idx("여효주"));
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
