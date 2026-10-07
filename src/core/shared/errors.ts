export interface ApiError {
  code: string;
  message: string;
}

export function error(code: string, message: string): ApiError {
  return { code, message };
}
