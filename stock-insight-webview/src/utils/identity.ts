import { nhBridge } from "../bridge/nhBridge";

const GUEST_ID_KEY = "stock-insight:guest-id";

// NH 로그인이 아직 없는 개발 환경을 위한 임시 식별자. 실제 NHBridge에서 진짜 userId를
// 받아올 수 있게 되면 이 값 대신 그걸 쓴다 (getCurrentUserId 참고).
function getOrCreateGuestId(): string {
  try {
    const existing = localStorage.getItem(GUEST_ID_KEY);
    if (existing) return existing;
    const id = `guest-${crypto.randomUUID()}`;
    localStorage.setItem(GUEST_ID_KEY, id);
    return id;
  } catch {
    // localStorage 접근 불가(프라이빗 모드 등)한 경우, 이번 세션 동안만 유효한 임시 ID
    return `guest-${crypto.randomUUID()}`;
  }
}

export async function getCurrentUserId(): Promise<string> {
  const nhUserId = await nhBridge.getUserId();
  return nhUserId ?? getOrCreateGuestId();
}
