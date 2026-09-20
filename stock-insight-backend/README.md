# 종목 인사이트 백엔드 (stock-insight-backend)

`stock-insight-webview`가 호출하는 API 서버. 지금은 인메모리 저장소 + (선택) Claude 기반 리포트 생성.

## 실행

```bash
npm install
cp .env.example .env   # 필요 시 ANTHROPIC_API_KEY 입력
npm run dev             # http://localhost:8787
npm test                 # 6개 API 테스트
```

`ANTHROPIC_API_KEY`를 설정하지 않으면 AI 리포트/영향요인 분석은 자동으로 mock 데이터로 대체됩니다 (개발/데모에 문제 없음).

## API

| Method | Path | 설명 |
|---|---|---|
| GET | `/health` | 헬스체크 |
| GET | `/api/stocks/search?q=` | 종목 검색 |
| GET | `/api/stocks/:code/report` | AI 종목 리포트 |
| GET | `/api/stocks/:code/factors` | 주가 영향요인 분석 |
| POST | `/api/predictions` | 방향성 예측 제출 `{code, stockName, direction}` (제출 시점 실시간가를 referencePrice로 저장) |
| GET | `/api/predictions` | 예측 이력 조회 |
| POST | `/api/predictions/:id/resolve` | 현재 실시간가와 referencePrice 비교해 적중 여부 판정 (데모/QA용 즉시 호출, 실제로는 익일 종가 배치가 호출해야 함) |
| POST | `/api/predictions/:id/claim-reward` | 리워드 수령 (적중 시에만) |

## 데이터 소스

- **시세/뉴스**: 네이버 금융 비공식 공개 API (`src/services/naverFinance.ts`). 키 불필요하지만 **문서화되지 않은 API**라 언제든 응답 구조가 바뀌거나 차단될 수 있음 — 실서비스 전환 시 정식 시세/뉴스 제공사 계약 필요.
- **AI 리포트/요인분석**: `ANTHROPIC_API_KEY` 설정 시 실제 뉴스를 근거로 Claude가 요약(RAG-lite). 미설정 시 실제 뉴스 원문을 그대로 노출(추출형)하는 mock으로 자동 대체.
- **예측 판정**: 제출 시점 실시간가(`referencePrice`)를 저장해두고, `/resolve` 호출 시점의 실시간가와 비교해 상승/하락 판정 (완전한 실데이터 기반).

## 알려진 제약 (TODO)

- [x] 뉴스 기반 리포트 생성 — 네이버 금융 실제 뉴스를 근거로 사용 (RAG-lite). 단, 공시/전문 시장데이터까지는 미포함
- [x] 예측 결과 판정을 실제 시세 비교로 교체 — 단, "익일 거래일 종가" 기준이 아니라 **`/resolve` 호출 시점의 실시간가**와 비교 (실제로는 익일 종가 확정 배치로 교체 필요, `POST /api/predictions/:id/resolve`가 그 자리에 들어갈 인터페이스)
- [x] 서버 재시작 시 데이터 소실 방지 — `data/predictions.json` 파일 영속화로 해결 (동시 쓰기 안전성은 없어 트래픽 커지면 실제 DB로 교체 필요)
- [ ] 사용자 인증 없음 — 전체 예측이 공용으로 조회됨, NHBridge.auth.getUserId 연동 후 사용자별 분리 필요 (네이티브 앱팀 스펙 필요, 미보유로 대기 중)
- [ ] 리워드 지급 시 실제 NHBridge 호출은 프론트엔드(`nhBridge.ts`)에서 수행 — 이 API는 "적중 여부"만 검증
- [ ] 네이버 비공식 API 장애/차단 시 폴백 없음 — 뉴스는 실패 시 빈 배열로 폴백되지만, 가격 조회 실패 시 예측 제출/판정 자체가 502로 실패함
