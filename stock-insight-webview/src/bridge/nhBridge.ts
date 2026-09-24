declare global {
  interface Window {
    NHBridge?: {
      reward: { grantPoint: (amount: number, reason: string) => Promise<void> };
      nav: { close: () => void; openScreen?: (screenId: string) => void };
      auth: { getUserId: () => Promise<string> };
    };
  }
}

// screenId는 NH 네이티브 앱이 정의하는 화면 식별자. 실제 스펙 확정 전까지의 자리표시자이며,
// 아직 종목/예측 결과에 따라 달라지는 개인화 값이 아닌 고정된 일반 화면만 가리킨다
// (AI 분석 결과와 특정 상품을 직접 연결하지 않기 위한 의도적 설계 — 투자 권유로 읽히지 않도록).
export type NHScreenId = "wm-consult" | "fund-catalog";

// 모든 NHBridge 호출은 이 어댑터를 통해서만 수행한다 (아키텍처 계약의 no-direct-bridge-string 규칙).
// bridge_policy에 정의된 max_calls_per_session은 네이티브 앱단에서 강제되며,
// 여기서는 브릿지 부재(개발 환경) 시 안전하게 no-op 처리한다.
export const nhBridge = {
  async grantRewardPoint(amount: number, reason: string): Promise<void> {
    if (!window.NHBridge) {
      console.warn("[nhBridge] NHBridge not available (dev environment)");
      return;
    }
    await window.NHBridge.reward.grantPoint(amount, reason);
  },
  closeWebview(): void {
    window.NHBridge?.nav.close();
  },
  async getUserId(): Promise<string | null> {
    if (!window.NHBridge) return null;
    return window.NHBridge.auth.getUserId();
  },
  // true를 반환하면 실제로 네이티브 화면 전환을 호출한 것, false면 브릿지 부재로 호출 못 한 것
  // (호출부에서 false일 때 대체 안내를 보여줄 수 있도록 구분해서 반환).
  openScreen(screenId: NHScreenId): boolean {
    if (!window.NHBridge?.nav.openScreen) {
      console.warn(`[nhBridge] openScreen(${screenId}) not available (dev environment)`);
      return false;
    }
    window.NHBridge.nav.openScreen(screenId);
    return true;
  },
};
