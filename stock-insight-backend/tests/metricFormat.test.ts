import { test } from "node:test";
import assert from "node:assert/strict";
import { formatApproxMarketCap, formatApproxWon, parseKoreanAmountToEok } from "../src/services/metricFormat.js";

test("parseKoreanAmountToEok: 조/억 혼합, 억만, 조만 표기를 모두 억 단위로 환산한다", () => {
  assert.equal(parseKoreanAmountToEok("1,674조 9,588억"), 16_749_588);
  assert.equal(parseKoreanAmountToEok("9,588억"), 9_588);
  assert.equal(parseKoreanAmountToEok("1,674조"), 16_740_000);
  assert.equal(parseKoreanAmountToEok("-"), null);
});

test("formatApproxMarketCap: 1조 이상은 '약 N조원' 한 줄로 반올림한다", () => {
  assert.equal(formatApproxMarketCap("1,674조 9,588억"), "약 1,675조원");
  assert.equal(formatApproxMarketCap("45조 6,000억"), "약 45.6조원");
  assert.equal(formatApproxMarketCap("9,588억"), "약 9,588억원");
});

test("formatApproxMarketCap: 파싱할 수 없는 값은 원본을 그대로 돌려준다", () => {
  assert.equal(formatApproxMarketCap("-"), "-");
  assert.equal(formatApproxMarketCap(""), "");
});

test("formatApproxWon: 만원 이상은 '약 N.N만원'으로, 그 미만은 원래 값을 유지한다", () => {
  assert.equal(formatApproxWon("22,292원"), "약 2.2만원");
  assert.equal(formatApproxWon("86,052원"), "약 8.6만원");
  assert.equal(formatApproxWon("1,668원"), "1,668원");
  assert.equal(formatApproxWon("0원"), "0원");
});

test("formatApproxWon: NAV처럼 소수점이 붙어 오는 만원 미만 값도 소수점 없이 정수로 보여준다", () => {
  assert.equal(formatApproxWon("7,966.90"), "7,967원");
  assert.equal(formatApproxWon("1,234.40"), "1,234원");
});

test("formatApproxWon: 억 단위 큰 값도 한 줄로 축약한다", () => {
  assert.equal(formatApproxWon("250,000,000원"), "약 2.5억원");
});

test("모든 결과 문자열은 줄바꿈 없이 한 줄이다", () => {
  const samples = [
    formatApproxMarketCap("1,674조 9,588억"),
    formatApproxMarketCap("9,588억"),
    formatApproxWon("22,292원"),
    formatApproxWon("86,052원"),
  ];
  for (const s of samples) assert.ok(!s.includes("\n"));
});
