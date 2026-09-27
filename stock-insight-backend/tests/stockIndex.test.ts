import { test } from "node:test";
import assert from "node:assert/strict";
import { rankStocks, normalize, type IndexedStock } from "../src/services/stockIndex.js";

const stock = (code: string, name: string, marketValue: number): IndexedStock => ({
  code,
  name,
  market: "KOSPI",
  marketValue,
  key: normalize(name),
});

const STOCKS = [
  stock("005930", "삼성전자", 1000),
  stock("005935", "삼성전자우", 200),
  stock("009150", "삼성전기", 300),
  stock("066570", "LG전자", 400),
  stock("000660", "SK하이닉스", 900),
  stock("035420", "NAVER", 500),
  stock("360750", "TIGER 미국S&P500", 800), // ETF도 검색 대상
  stock("069500", "KODEX 200", 700),
];

const names = (query: string) => rankStocks(STOCKS, query).map((s) => s.name);

test("검색어가 종목명 중간/끝에 있어도 매칭된다 ('전자' → 삼성전자)", () => {
  const result = names("전자");
  assert.ok(result.includes("삼성전자"));
  assert.ok(result.includes("LG전자"));
  assert.ok(!result.includes("삼성전기"));
});

test("앞부분 일치가 포함 일치보다 먼저, 같은 순위에서는 시가총액 순", () => {
  assert.deepEqual(names("삼성"), ["삼성전자", "삼성전기", "삼성전자우"]);
  // '전자' 는 모두 '포함' 일치 → 시가총액 큰 순
  assert.deepEqual(names("전자"), ["삼성전자", "LG전자", "삼성전자우"]);
});

test("정확히 일치하는 종목이 가장 먼저 나온다", () => {
  assert.equal(names("삼성전자")[0], "삼성전자");
});

test("대소문자·공백을 무시한다", () => {
  assert.deepEqual(names("naver"), ["NAVER"]);
  assert.deepEqual(names("sk 하이닉스"), ["SK하이닉스"]);
});

test("ETF도 검색된다 (TIGER, KODEX, 이름 중간 포함)", () => {
  assert.deepEqual(names("tiger"), ["TIGER 미국S&P500"]);
  assert.deepEqual(names("kodex"), ["KODEX 200"]);
  assert.deepEqual(names("미국"), ["TIGER 미국S&P500"]);
});

test("종목코드 앞부분으로도 검색된다", () => {
  assert.deepEqual(names("00593"), ["삼성전자", "삼성전자우"]);
});

test("빈 검색어나 일치 없음은 빈 배열", () => {
  assert.deepEqual(names("   "), []);
  assert.deepEqual(names("없는종목"), []);
});

test("결과에 내부용 key 필드가 노출되지 않는다", () => {
  assert.ok(!("key" in rankStocks(STOCKS, "삼성")[0]));
});
