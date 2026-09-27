// 우선주는 종목명이 "삼성전자우", "현대차2우B", "CJ4우(전환)"처럼 "우"로 끝나 오타처럼 보일 수 있어
// 화면 표시용으로 "(우선주)"를 덧붙인다. (저장/조회에 쓰는 원본 종목명은 그대로 둔다)
//
// 이름만으로는 "성우", "이오플로우" 같은 일반 종목과 구분되지 않는데, 국내 보통주 종목코드는
// 끝자리가 0이고 우선주는 0이 아니라서(예: 삼성전자 005930 / 삼성전자우 005935) 코드까지 함께 본다.
const PREFERRED_NAME_PATTERN = /우[A-C]?(\(전환\))?$/;

export function isPreferredStock(name: string, code: string): boolean {
  return PREFERRED_NAME_PATTERN.test(name) && !code.endsWith("0");
}

export function displayStockName(name: string, code: string): string {
  return isPreferredStock(name, code) ? `${name} (우선주)` : name;
}
