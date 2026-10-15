import test from "node:test";
import assert from "node:assert/strict";
import { getDailyCloses, getFirstClosedCloseOnOrAfter, getReferencePrice } from "../src/services/naverFinance.js";

// 정규장 종가 = 15:30 동시호가 분봉. 그 뒤 15:40~ 시간외 봉은 가격이 달라질 수 있다 (조회 범위는 15:00~15:39).
// 날짜(YYYYMMDD) → 그날 15:00~15:39 분봉. 10/17(토)·10/18(일)은 휴장이라 비어 있다.
const MINUTE_BARS: Record<string, { time: string; price: number }[]> = {
  "20261014": [{ time: "1529", price: 231500 }, { time: "1530", price: 232000 }],
  "20261015": [{ time: "1529", price: 209500 }, { time: "1530", price: 210000 }],
  "20261016": [{ time: "1529", price: 210500 }, { time: "1530", price: 211000 }],
  "20261019": [{ time: "1529", price: 211500 }, { time: "1530", price: 212000 }],
};

async function withMockedChart<T>(fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    const date = /startDateTime=(\d{8})/.exec(url)?.[1] ?? "";
    const body = (MINUTE_BARS[date] ?? []).map((b) => ({
      localDateTime: `${date}${b.time}00`,
      currentPrice: b.price,
      accumulatedTradingVolume: 1000,
    }));
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test("정규장 마감(15:30) 후에는 기준일 당일 종가를 쓴다", async () => {
  const afterClose = new Date("2026-10-16T08:00:00Z"); // 금 17:00 KST
  const r = await withMockedChart(() => getFirstClosedCloseOnOrAfter("005930", "2026-10-16", afterClose));
  assert.deepEqual(r, { date: "2026-10-16", closePrice: 211000 });
});

test("기준일 당일 정규장 중에는 아직 확정 전이라 null을 돌려준다", async () => {
  const duringMarket = new Date("2026-10-16T03:00:00Z"); // 금 12:00 KST
  const r = await withMockedChart(() => getFirstClosedCloseOnOrAfter("005930", "2026-10-16", duringMarket));
  assert.equal(r, null);
});

test("서버가 늦게 깨어나도 월요일 장중 시세가 아니라 기준일(금)의 종가를 쓴다", async () => {
  const mondayMidday = new Date("2026-10-19T03:00:00Z"); // 월 12:00 KST
  const r = await withMockedChart(() => getFirstClosedCloseOnOrAfter("005930", "2026-10-16", mondayMidday));
  assert.deepEqual(r, { date: "2026-10-16", closePrice: 211000 });
});

test("휴장일(토요일 기준)이면 다음 거래일 종가를 쓰고, 그날 장중이면 대기한다", async () => {
  const mondayAfterClose = new Date("2026-10-19T08:00:00Z"); // 월 17:00 KST
  const mondayMidday = new Date("2026-10-19T03:00:00Z"); // 월 12:00 KST
  const done = await withMockedChart(() => getFirstClosedCloseOnOrAfter("005930", "2026-10-17", mondayAfterClose));
  assert.deepEqual(done, { date: "2026-10-19", closePrice: 212000 });
  const waiting = await withMockedChart(() => getFirstClosedCloseOnOrAfter("005930", "2026-10-17", mondayMidday));
  assert.equal(waiting, null);
});

test("시간외·애프터마켓이 열려 있는 저녁(~20:00)에도 정규장 종가를 그대로 쓴다", async () => {
  const evening = new Date("2026-10-15T09:00:00Z"); // 목 18:00 KST
  const r = await withMockedChart(() => getFirstClosedCloseOnOrAfter("005930", "2026-10-15", evening));
  assert.deepEqual(r, { date: "2026-10-15", closePrice: 210000 });
});

test("15:30 봉이 아직 없으면(마감 직전) 종가로 보지 않는다", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify([{ localDateTime: "20261015152900", currentPrice: 209500 }]), {
      status: 200,
    })) as typeof fetch;
  try {
    const now = new Date("2026-10-15T06:45:00Z"); // 목 15:45 KST인데 데이터가 아직 15:29까지만 있는 경우
    const r = await getFirstClosedCloseOnOrAfter("005930", "2026-10-15", now);
    assert.equal(r, null);
  } finally {
    globalThis.fetch = original;
  }
});

test("최근 정규장 종가 목록은 오래된 순이고, 휴장일과 장중인 오늘은 빠진다", async () => {
  const fridayMidday = new Date("2026-10-16T03:00:00Z"); // 금 12:00 KST (오늘 종가 미확정)
  const closes = await withMockedChart(() => getDailyCloses("005930", fridayMidday));
  assert.deepEqual(closes, [
    { date: "2026-10-14", closePrice: 232000 },
    { date: "2026-10-15", closePrice: 210000 },
  ]);
  const mondayEvening = new Date("2026-10-19T09:00:00Z");
  const all = await withMockedChart(() => getDailyCloses("005930", mondayEvening));
  assert.deepEqual(all.map((c) => c.date), ["2026-10-14", "2026-10-15", "2026-10-16", "2026-10-19"]);
});

test("기준가: 장이 닫혀 있을 때(마감 후·주말) 제출하면 직전 정규장 종가를 쓴다", async () => {
  const fridayEvening = new Date("2026-10-16T09:00:00Z"); // 금 18:00 KST
  const saturday = new Date("2026-10-17T03:00:00Z"); // 토 12:00 KST
  assert.equal(await withMockedChart(() => getReferencePrice("005930", fridayEvening)), 211000);
  assert.equal(await withMockedChart(() => getReferencePrice("005930", saturday)), 211000);
});
