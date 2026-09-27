// "투자 지표" 카드용 금액 표시 가공. 네이버가 주는 "1,674조 9,588억" 같은 정확한 값을
// 화면에서 한 줄로 읽기 쉬운 대략적인 금액("약 1,675조원")으로 다시 포맷한다.
// (PER/PBR/배당수익률 같은 배율·비율 값은 원래도 짧아 손대지 않는다 — naverFinance.ts 참고)

// "1,674조 9,588억" / "9,588억" / "1,674조" 등을 억 단위 숫자로 변환
export function parseKoreanAmountToEok(text: string): number | null {
  const jo = text.match(/([\d,]+)\s*조/);
  const eok = text.match(/([\d,]+)\s*억/);
  if (!jo && !eok) return null;
  const joValue = jo ? Number(jo[1].replace(/,/g, "")) : 0;
  const eokValue = eok ? Number(eok[1].replace(/,/g, "")) : 0;
  if (Number.isNaN(joValue) || Number.isNaN(eokValue)) return null;
  return joValue * 10000 + eokValue;
}

// 1조 이상은 조 단위로, 그 미만은 억 단위로 반올림해 한 줄짜리 대략적인 금액 문자열을 만든다.
export function formatApproxMarketCap(raw: string): string {
  const totalEok = parseKoreanAmountToEok(raw);
  if (totalEok === null || totalEok <= 0) return raw; // 파싱 실패 시 원래 값 그대로 (안전한 폴백)

  if (totalEok >= 10000) {
    const jo = totalEok / 10000;
    const rounded = jo >= 100 ? Math.round(jo) : Math.round(jo * 10) / 10;
    return `약 ${rounded.toLocaleString("ko-KR")}조원`;
  }
  return `약 ${Math.round(totalEok).toLocaleString("ko-KR")}억원`;
}

// "22,292원" 같은 주당 금액을 만/억 단위로 반올림한다. 만원 미만은 원 단위로 남기되(NAV처럼
// 소수점이 붙어 오는 값도 있어) 정수로 반올림해 소수점 없이 보여준다.
export function formatApproxWon(raw: string): string {
  const match = raw.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!match) return raw;
  const won = Number(match[0]);
  if (Number.isNaN(won)) return raw;

  const abs = Math.abs(won);
  if (abs >= 1e8) return `약 ${(won / 1e8).toFixed(1)}억원`;
  if (abs >= 10000) return `약 ${(won / 10000).toFixed(1)}만원`;
  return `${Math.round(won).toLocaleString("ko-KR")}원`;
}
