import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdir, stat, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import type { Logger } from "pino";
import { PairingService } from "../auth/pairing-service.js";
import { ScheduledTaskConfigService } from "../config/scheduled-task-config.js";
import { appConfigSchema } from "../config/schema.js";
import { ConfigService } from "../config/service.js";
import { getAppPaths, type AppPaths } from "../config/paths.js";
import { ScheduledTaskManager } from "../daemon/scheduled-task-manager.js";
import { ScheduledTaskStatusStore } from "../runtime/scheduled-task-status-store.js";
import { getLogger } from "../shared/logger.js";
import type { AppStatus } from "../shared/types.js";
import { handleConfigGet, handleConfigSet } from "./handlers/config.js";
import { handlePairingApprove, handlePairingList } from "./handlers/pairing.js";
import {
  handleScheduledTaskCreate,
  handleScheduledTaskDelete,
  handleScheduledTaskList,
  handleScheduledTaskStatus,
  handleScheduledTaskUpdate
} from "./handlers/scheduled-tasks.js";
import { handleStatus } from "./handlers/status.js";
import {
  pairingApproveRequestSchema,
  scheduledTaskCreateRequestSchema,
  scheduledTaskDeleteRequestSchema,
  scheduledTaskUpdateRequestSchema,
  type PingResponse,
  type IpcErrorResponse
} from "./schema.js";

export interface IpcServerOptions {
  paths?: AppPaths;
  logger?: Logger;
  configService?: ConfigService;
  scheduledTaskManager?: ScheduledTaskManager;
  pairingService?: PairingService;
  supportedPairingChannels?: string[];
  reloadConfig?: () => Promise<object>;
  getStatus?: () => Promise<AppStatus> | AppStatus;
}

export class IpcServer {
  private readonly paths: AppPaths;
  private readonly logger: Logger;
  private readonly configService: ConfigService;
  private readonly scheduledTaskManager: ScheduledTaskManager;
  private readonly pairingService: PairingService;
  private readonly supportedPairingChannels: Set<string>;
  private readonly reloadConfig: (() => Promise<object>) | undefined;
  private readonly resolveStatus: () => Promise<AppStatus> | AppStatus;
  private server: Server | null = null;

  constructor(options: IpcServerOptions = {}) {
    this.paths = options.paths ?? getAppPaths();
    this.logger = options.logger ?? getLogger("ipc");
    this.configService = options.configService ?? new ConfigService(this.paths);
    this.scheduledTaskManager = options.scheduledTaskManager ?? new ScheduledTaskManager(
      new ScheduledTaskConfigService(this.paths),
      new ScheduledTaskStatusStore(this.paths),
      this.paths
    );
    this.pairingService = options.pairingService ?? new PairingService();
    this.supportedPairingChannels = new Set(options.supportedPairingChannels ?? ["telegram"]);
    this.reloadConfig = options.reloadConfig;
    this.resolveStatus = options.getStatus ?? (() => ({
      ok: true,
      service: "baliclaw",
      version: "0.5.0"
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
          if (isServerNotRunningError(error)) {
            resolve();
            return;
          }

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
        this.writeJson(response, 200, await handleStatus(() => this.getStatus()));
        return;
      }

      if (method === "GET" && url.pathname === "/v1/config") {
        this.writeJson(response, 200, await handleConfigGet(this.configService));
        return;
      }

      if (method === "GET" && url.pathname === "/v1/pairing/list") {
        const channel = url.searchParams.get("channel")?.trim() ?? "";

        if (!this.supportedPairingChannels.has(channel)) {
          this.writeJson(response, 400, {
            ok: false,
            error: {
              code: "IPC_INVALID_REQUEST",
              message: `Unsupported pairing channel: ${channel || "<empty>"}`
            }
          } satisfies IpcErrorResponse);
          return;
        }

        this.writeJson(response, 200, {
          channel,
          requests: await handlePairingList(this.pairingService, channel)
        });
        return;
      }

      if (method === "GET" && url.pathname === "/v1/scheduled-tasks") {
        this.writeJson(response, 200, {
          tasks: await handleScheduledTaskList(this.scheduledTaskManager)
        });
        return;
      }

      if (method === "GET" && url.pathname === "/v1/scheduled-tasks/status") {
        const taskId = url.searchParams.get("taskId")?.trim();
        if (!taskId) {
          this.writeJson(response, 400, {
            ok: false,
            error: {
              code: "IPC_INVALID_REQUEST",
              message: "taskId is required"
            }
          } satisfies IpcErrorResponse);
          return;
        }

        this.writeJson(response, 200, {
          taskId,
          status: await handleScheduledTaskStatus(this.scheduledTaskManager, taskId)
        });
        return;
      }

      if (method === "POST" && url.pathname === "/v1/config/set") {
        const body = appConfigSchema.parse(await this.readJsonBody(request));
        this.writeJson(response, 200, await handleConfigSet(this.configService, body, this.reloadConfig));
        return;
      }

      if (method === "POST" && url.pathname === "/v1/scheduled-tasks/create") {
        const body = scheduledTaskCreateRequestSchema.parse(await this.readJsonBody(request));
        this.writeJson(response, 200, {
          taskId: body.taskId,
          task: await handleScheduledTaskCreate(
            this.scheduledTaskManager,
            body.taskId,
            body.task,
            this.reloadConfig
          )
        });
        return;
      }

      if (method === "POST" && url.pathname === "/v1/scheduled-tasks/update") {
        const body = scheduledTaskUpdateRequestSchema.parse(await this.readJsonBody(request));
        this.writeJson(response, 200, {
          taskId: body.taskId,
          task: await handleScheduledTaskUpdate(
            this.scheduledTaskManager,
            body.taskId,
            body.task,
            this.reloadConfig
          )
        });
        return;
      }

      if (method === "POST" && url.pathname === "/v1/scheduled-tasks/delete") {
        const body = scheduledTaskDeleteRequestSchema.parse(await this.readJsonBody(request));
        this.writeJson(response, 200, {
          taskId: body.taskId,
          deleted: await handleScheduledTaskDelete(this.scheduledTaskManager, body.taskId, this.reloadConfig)
        });
        return;
      }

      if (method === "POST" && url.pathname === "/v1/pairing/approve") {
        const body = pairingApproveRequestSchema.parse(await this.readJsonBody(request));

        if (!this.supportedPairingChannels.has(body.channel)) {
          this.writeJson(response, 400, {
            ok: false,
            error: {
              code: "IPC_INVALID_REQUEST",
              message: `Unsupported pairing channel: ${body.channel}`
            }
          } satisfies IpcErrorResponse);
          return;
        }

        this.writeJson(response, 200, {
          channel: body.channel,
          approved: await handlePairingApprove(this.pairingService, body.channel, body.code)
        });
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

  private async readJsonBody(request: IncomingMessage): Promise<unknown> {
    const chunks: string[] = [];

    for await (const chunk of request) {
      chunks.push(chunk.toString());
    }

    const raw = chunks.join("").trim();
    return raw.length === 0 ? {} : JSON.parse(raw);
  }
}

function isServerNotRunningError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "ERR_SERVER_NOT_RUNNING";
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
