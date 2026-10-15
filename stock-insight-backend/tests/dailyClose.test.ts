import test from "node:test";
import assert from "node:assert/strict";
import { getFirstClosedCloseOnOrAfter } from "../src/services/naverFinance.js";

const ROWS = [
  { localTradedAt: "2026-10-19", closePrice: "212,000" }, // 월
  { localTradedAt: "2026-10-16", closePrice: "208,500" }, // 금
  { localTradedAt: "2026-10-15", closePrice: "234,500" }, // 목
];

async function withMockedRows<T>(fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify(ROWS), { status: 200 })) as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test("장 마감 후에는 기준일 당일 종가를 쓴다", async () => {
  const afterClose = new Date("2026-10-16T08:00:00Z"); // 금 17:00 KST
  const r = await withMockedRows(() => getFirstClosedCloseOnOrAfter("005930", "2026-10-16", afterClose));
  assert.deepEqual(r, { date: "2026-10-16", closePrice: 208500 });
});

test("기준일 당일 장중에는 아직 확정 전이라 null을 돌려준다", async () => {
  const duringMarket = new Date("2026-10-16T03:00:00Z"); // 금 12:00 KST
  const r = await withMockedRows(() => getFirstClosedCloseOnOrAfter("005930", "2026-10-16", duringMarket));
  assert.equal(r, null);
});

test("서버가 늦게 깨어나도 월요일 장중 시세가 아니라 기준일(금)의 종가를 쓴다", async () => {
  const mondayMidday = new Date("2026-10-19T03:00:00Z"); // 월 12:00 KST
  const r = await withMockedRows(() => getFirstClosedCloseOnOrAfter("005930", "2026-10-16", mondayMidday));
  assert.deepEqual(r, { date: "2026-10-16", closePrice: 208500 });
});

test("휴장일(토요일 기준)이면 다음 거래일 종가를 쓰고, 그날 장중이면 대기한다", async () => {
  const mondayAfterClose = new Date("2026-10-19T08:00:00Z"); // 월 17:00 KST
  const mondayMidday = new Date("2026-10-19T03:00:00Z"); // 월 12:00 KST
  const done = await withMockedRows(() => getFirstClosedCloseOnOrAfter("005930", "2026-10-17", mondayAfterClose));
  assert.deepEqual(done, { date: "2026-10-19", closePrice: 212000 });
  const waiting = await withMockedRows(() => getFirstClosedCloseOnOrAfter("005930", "2026-10-17", mondayMidday));
  assert.equal(waiting, null);
});
