declare global {
  interface Window {
    NHBridge?: {
      reward: { grantPoint: (amount: number, reason: string) => Promise<void> };
      nav: { close: () => void };
      auth: { getUserId: () => Promise<string> };
    };
  }
}

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
};
