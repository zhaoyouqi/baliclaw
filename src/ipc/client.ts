import { request } from "node:http";
import { getAppPaths, type AppPaths } from "../config/paths.js";
import { type AppConfig } from "../config/schema.js";
import { AppError, appErrorCodes, toAppError } from "../shared/errors.js";
import type { AppStatus } from "../shared/types.js";
import { configResponseSchema, ipcErrorResponseSchema, pingResponseSchema, statusResponseSchema } from "./schema.js";

interface HttpJsonResponse {
  body: unknown;
  statusCode: number;
}

export interface IpcClientOptions {
  paths?: AppPaths;
  requestJson?: (path: string, init?: { method?: "GET" | "POST"; body?: unknown }) => Promise<HttpJsonResponse>;
}

export class IpcClient {
  private readonly paths: AppPaths;
  private readonly executeRequest: (path: string, init?: { method?: "GET" | "POST"; body?: unknown }) => Promise<HttpJsonResponse>;

  constructor(options: IpcClientOptions = {}) {
    this.paths = options.paths ?? getAppPaths();
    this.executeRequest = options.requestJson ?? ((path, init) => requestJsonOverSocket(this.paths.socketFile, path, init));
  }

  async ping(): Promise<void> {
    const response = await this.performRequest("/v1/ping", pingResponseSchema, {
      invalidMessage: "Invalid IPC ping response"
    });

    pingResponseSchema.parse(response);
  }

  async getStatus(): Promise<AppStatus> {
    return await this.performRequest("/v1/status", statusResponseSchema, {
      invalidMessage: "Invalid IPC status response"
    });
  }

  async getConfig(): Promise<AppConfig> {
    return await this.performRequest("/v1/config", configResponseSchema, {
      invalidMessage: "Invalid IPC config response"
    });
  }

  async setConfig(config: AppConfig): Promise<AppConfig> {
    return await this.performRequest("/v1/config/set", configResponseSchema, {
      invalidMessage: "Invalid IPC config response",
      method: "POST",
      body: config
    });
  }

  private async performRequest<T>(
    path: string,
    schema: { parse: (value: unknown) => T },
    options: {
      invalidMessage: string;
      method?: "GET" | "POST";
      body?: unknown;
    }
  ): Promise<T> {
    try {
      const requestInit: { method?: "GET" | "POST"; body?: unknown } = {};
      if (options.method) {
        requestInit.method = options.method;
      }
      if (options.body !== undefined) {
        requestInit.body = options.body;
      }

      const response = await this.executeRequest(path, requestInit);

      if (response.statusCode >= 400) {
        const errorPayload = ipcErrorResponseSchema.safeParse(response.body);
        if (errorPayload.success) {
          throw new AppError(
            errorPayload.data.error.message,
            appErrorCodes.ipcUnavailable,
            undefined,
            {
              statusCode: response.statusCode,
              remoteCode: errorPayload.data.error.code
            }
          );
        }
      }

      return schema.parse(response.body);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      if (isSocketUnavailable(error)) {
        throw new AppError("BaliClaw daemon is not running", appErrorCodes.ipcUnavailable, error);
      }

      throw toAppError(error, {
        message: options.invalidMessage,
        code: appErrorCodes.ipcInvalidResponse
      });
    }
  }
}

async function requestJsonOverSocket(
  socketFile: string,
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown } = {}
): Promise<HttpJsonResponse> {
  return await new Promise<HttpJsonResponse>((resolve, reject) => {
    const method = init.method ?? "GET";
    const requestBody = init.body === undefined ? undefined : JSON.stringify(init.body);
    const req = request(
      {
        socketPath: socketFile,
        path,
        method,
        headers: requestBody
          ? {
              "content-type": "application/json",
              "content-length": Buffer.byteLength(requestBody)
            }
          : undefined
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          try {
            resolve({
              statusCode: response.statusCode ?? 0,
              body: JSON.parse(raw)
            });
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on("error", reject);

    if (requestBody) {
      req.write(requestBody);
    }

    req.end();
  });
}

function isSocketUnavailable(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error.code === "ENOENT" || error.code === "ECONNREFUSED");
}
