export const appErrorCodes = {
  ipcUnavailable: "IPC_UNAVAILABLE",
  ipcInvalidResponse: "IPC_INVALID_RESPONSE",
  configInvalid: "CONFIG_INVALID",
  runtimeAgentFailed: "RUNTIME_AGENT_FAILED"
} as const;

export type AppErrorCode = (typeof appErrorCodes)[keyof typeof appErrorCodes];

export class AppError extends Error {
  constructor(
    message: string,
    readonly code: AppErrorCode,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function toAppError(
  error: unknown,
  defaults: { message: string; code: AppErrorCode }
): AppError {
  if (error instanceof AppError) {
    return error;
  }

  return new AppError(defaults.message, defaults.code, error);
}
