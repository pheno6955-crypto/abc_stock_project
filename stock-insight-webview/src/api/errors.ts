import { AxiosError } from "axios";

export function getErrorMessage(
  err: unknown,
  fallback = "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as { error?: string } | undefined;
    if (data?.error) return data.error;
    if (err.code === "ECONNABORTED") return "요청 시간 초과 - 백엔드 서버가 응답하지 않습니다";
    if (err.message === "Network Error") return "네트워크 연결 실패 - 백엔드 서버에 연결할 수 없습니다";
    if (err.response?.status === 502 || err.response?.status === 503) {
      return "백엔드 서버에 일시적인 오류가 발생했습니다";
    }
    console.error("[API Error]", {
      status: err.response?.status,
      message: err.message,
      data: err.response?.data,
    });
  }
  return fallback;
}
