# 종목 인사이트 웹뷰 (AI 기반 증권 종목 인사이트 및 방향성 예측 참여형 서비스)

NH은행 앱 내 WebView로 탑재될 서비스 스캐폴드. Architecture Contract는
`../abc_ai_agent-main/contracts/generated/stock-insight-webview-contract.json` 참고.

## 실행

백엔드(`../stock-insight-backend`)가 먼저 떠 있어야 실제 데이터가 보입니다.

```bash
# 터미널 1
cd ../stock-insight-backend && npm install && npm run dev   # http://localhost:8787

# 터미널 2
npm install
npm run dev       # http://localhost:5173
npm run build      # 프로덕션 빌드 (타입체크 포함)
npm test           # 컴포넌트 테스트 (vitest)
```

## 화면 구성

1. `StockSearch` — 종목 검색/선택
2. `Report` — AI 종목 리포트 (핵심 이슈, 투자 포인트)
3. `FactorAnalysis` — 상승/하락 요인 시각화
4. `Predict` — 방향성 예측 참여 (비투자성)
5. `Result` — 예측 제출 완료 안내
6. `MyHistory` — 내 예측 이력 및 리워드 수령

## 다음 단계 (TODO)

- [x] `src/api/client.ts`를 axios 기반으로 `stock-insight-backend` 실제 호출하도록 교체 완료
- [x] AI 리포트/영향요인분석이 실제 뉴스·시세(네이버 금융) 기반으로 동작 (`../stock-insight-backend/README.md`의 "데이터 소스" 참고)
- [x] 예측 결과 판정을 실제 시세 비교로 교체 (`POST /predictions/:id/resolve`, 프론트는 "내 예측 이력"에서 수동 트리거) — 단 "익일 종가" 기준이 아니라 호출 시점 실시간가 기준, 실제 배치 전환은 인터페이스만 준비된 상태
- [ ] `src/bridge/nhBridge.ts`를 네이티브 앱팀의 실제 NHBridge 스펙으로 교체 (`auth.getUserId` 포함 여부 확인 필요) — **외부 스펙 필요, 대기 중**
- [ ] NH 실제 디자인 시스템 토큰으로 `../abc_ai_agent-main/design/tokens.json` 교체
- [ ] 법무/컴플라이언스 검토: 비투자성 문구, 리워드 정책 (`requires_approval: true`로 설정된 `NHBridge.reward.grantPoint` 승인 프로세스 확정)
- [x] QA 단계: 백엔드 API 테스트 7종 + 프론트엔드 컴포넌트 테스트 5종 작성·통과
- [x] API 실패 시 에러 처리 (무한 로딩 방지) — 모든 페이지에 에러 메시지 + 재시도 버튼 추가, axios 10초 타임아웃 적용

## 알려진 이슈

- 이 프로젝트는 Claude 데스크톱 앱의 세션 작업 폴더(AppContainer 가상화 경로)에서 실행됩니다.
  Vite 기본 설정에서는 `Failed to load url ... Does the file exist?` 오류가 발생하여
  `vite.config.ts`에 `resolve.preserveSymlinks: true`와 `server.fs.strict: false`를 추가해 우회했습니다.
  일반 로컬 경로(비-가상화 경로)로 옮기면 이 설정은 없어도 됩니다.
- 테스트 도구(vitest/vite 계열) devDependency에 npm audit 취약점 경고(critical 1건 포함)가 있으나,
  전부 **로컬 dev 서버·Vitest UI에만 해당**하는 이슈로 프로덕션 빌드(`dist/`)에는 영향 없음.
  `npm audit fix --force`는 vite 8 / vitest 5로 breaking upgrade가 필요해 별도 검증 없이 적용하지 않음.
