import { AxiosError } from "axios";

export function getErrorMessage(
  err: unknown,
  fallback = "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as { error?: string } | undefined;
    if (data?.error) return data.error;
  }
  return fallback;
}
