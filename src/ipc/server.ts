import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdir, stat, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import type { Logger } from "pino";
import { getAppPaths, type AppPaths } from "../config/paths.js";
import { getLogger } from "../shared/logger.js";
import type { AppStatus } from "../shared/types.js";
import type { PingResponse, IpcErrorResponse } from "./schema.js";

export interface IpcServerOptions {
  paths?: AppPaths;
  logger?: Logger;
  getStatus?: () => Promise<AppStatus> | AppStatus;
}

export class IpcServer {
  private readonly paths: AppPaths;
  private readonly logger: Logger;
  private readonly resolveStatus: () => Promise<AppStatus> | AppStatus;
  private server: Server | null = null;

  constructor(options: IpcServerOptions = {}) {
    this.paths = options.paths ?? getAppPaths();
    this.logger = options.logger ?? getLogger("ipc");
    this.resolveStatus = options.getStatus ?? (() => ({
      ok: true,
      service: "baliclaw",
      version: "0.1.0"
    }));
  }

  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    await mkdir(dirname(this.paths.socketFile), { recursive: true });
    await cleanupStaleSocket(this.paths.socketFile);

    this.server = createServer((request, response) => {
      void this.handleRequest(request, response);
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        this.server?.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        this.server?.off("error", onError);
        resolve();
      };

      this.server?.once("error", onError);
      this.server?.once("listening", onListening);
      this.server?.listen(this.paths.socketFile);
    });

    this.logger.info({ socketFile: this.paths.socketFile }, "ipc server listening");
  }

  async stop(): Promise<void> {
    if (!this.server) {
      await cleanupSocketFile(this.paths.socketFile);
      return;
    }

    const server = this.server;
    this.server = null;

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    await cleanupSocketFile(this.paths.socketFile);
    this.logger.info("ipc server stopped");
  }

  async getStatus(): Promise<AppStatus> {
    return await this.resolveStatus();
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", "http://localhost");

      if (method === "GET" && url.pathname === "/v1/ping") {
        this.writeJson(response, 200, { ok: true } satisfies PingResponse);
        return;
      }

      if (method === "GET" && url.pathname === "/v1/status") {
        this.writeJson(response, 200, await this.getStatus());
        return;
      }

      this.writeJson(response, 404, {
        ok: false,
        error: {
          code: "IPC_ROUTE_NOT_FOUND",
          message: `No IPC route for ${method} ${url.pathname}`
        }
      } satisfies IpcErrorResponse);
    } catch (error) {
      this.logger.error({ err: error }, "ipc request failed");
      this.writeJson(response, 500, {
        ok: false,
        error: {
          code: "IPC_INTERNAL_ERROR",
          message: "IPC server failed to process the request"
        }
      } satisfies IpcErrorResponse);
    }
  }

  private writeJson(response: ServerResponse, statusCode: number, payload: object): void {
    response.statusCode = statusCode;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(`${JSON.stringify(payload)}\n`);
  }
}

async function cleanupStaleSocket(path: string): Promise<void> {
  try {
    const stats = await stat(path);
    if (stats.isSocket()) {
      await unlink(path);
    }
  } catch (error) {
    if (!isFileMissing(error)) {
      throw error;
    }
  }
}

async function cleanupSocketFile(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (!isFileMissing(error)) {
      throw error;
    }
  }
}

function isFileMissing(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
