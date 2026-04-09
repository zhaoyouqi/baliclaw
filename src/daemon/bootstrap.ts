import type { Logger } from "pino";
import { PairingService } from "../auth/pairing-service.js";
import type { ChannelAdapter } from "../channel/adapter.js";
import { InboundRouter } from "../channel/router.js";
import { ensureStateDirectories, getAppPaths, type AppPaths } from "../config/paths.js";
import { ScheduledTaskConfigService } from "../config/scheduled-task-config.js";
import type { AppConfig } from "../config/schema.js";
import { ConfigService } from "../config/service.js";
import { IpcServer } from "../ipc/server.js";
import { AgentService, type ScheduledAgentRunOptions } from "../runtime/agent-service.js";
import { SessionService } from "../session/service.js";
import { getLogger } from "../shared/logger.js";
import { TelegramService, type TelegramPollingBot } from "../telegram/service.js";
import { ReloadService } from "./reload-service.js";
import { ScheduledTaskRunError, ScheduledTaskService } from "./scheduled-task-service.js";
import { createShutdownController, type ShutdownController } from "./shutdown.js";

export interface BootstrapContext {
  paths: AppPaths;
  config: AppConfig;
  configService: ConfigService;
  logger: Logger;
  ipcServer: IpcServer;
  pairingService: PairingService;
  sessionService: SessionService;
  agentService: AgentService;
  channelRouter: InboundRouter;
  telegramService: TelegramService;
  scheduledTaskService: ScheduledTaskService;
  reloadService: ReloadService;
  shutdownController: ShutdownController;
}

export interface BootstrapOptions {
  paths?: AppPaths;
  configService?: ConfigService;
  ipcServer?: IpcServer;
  telegramService?: TelegramService;
  telegramBot?: TelegramPollingBot;
  pairingService?: PairingService;
  sessionService?: SessionService;
  agentService?: AgentService;
  scheduledTaskService?: ScheduledTaskService;
  reloadService?: ReloadService;
  sendText?: (target: Parameters<TelegramService["sendText"]>[0], text: string) => Promise<void>;
  createTypingHeartbeat?: (
    target: Parameters<TelegramService["createTypingHeartbeat"]>[0]
  ) => Awaited<ReturnType<TelegramService["createTypingHeartbeat"]>>;
}

export async function bootstrap(options: BootstrapOptions = {}): Promise<BootstrapContext> {
  const paths = options.paths ?? getAppPaths();
  const configService = options.configService ?? new ConfigService(paths);

  await ensureStateDirectories(paths);

  let currentConfig = await configService.load();
  const logger = getLogger("daemon", {
    level: currentConfig.logging.level
  });
  const ipcLogger = getLogger("ipc", {
    level: currentConfig.logging.level
  });
  const configLogger = getLogger("config", {
    level: currentConfig.logging.level
  });
  const agentLogger = getLogger("agent", {
    level: currentConfig.logging.level
  });
  const scheduledTaskLogger = getLogger("scheduled-tasks", {
    level: currentConfig.logging.level
  });
  const telegramLogger = getLogger("telegram", {
    level: currentConfig.logging.level
  });
  const pairingService = options.pairingService ?? new PairingService();
  const sessionService = options.sessionService ?? new SessionService();
  const agentService = options.agentService ?? new AgentService({
    logger: agentLogger
  });
  const shutdownController = createShutdownController(logger);
  const adapters = new Map<string, ChannelAdapter>();

  let activeTelegramService = options.telegramService ?? createTelegramService();
  let activeScheduledTaskService = options.scheduledTaskService ?? new ScheduledTaskService();

  const channelRouter = new InboundRouter({
    pairingService,
    sessionService,
    agentService,
    getAdapter: (channelId) => adapters.get(channelId),
    buildAgentRunOptions: (sessionKey) => buildAgentRunOptions(currentConfig, sessionKey)
  });

  const setTelegramInboundHandler = (service: TelegramService): void => {
    if ("setInboundHandler" in service && typeof service.setInboundHandler === "function") {
      service.setInboundHandler((envelope) => channelRouter.handleInbound(envelope));
    }
  };

  setTelegramInboundHandler(activeTelegramService);

  const activateTelegramService = (service: TelegramService, enabled: boolean): void => {
    activeTelegramService = service;
    setTelegramInboundHandler(activeTelegramService);

    if (enabled) {
      adapters.set(activeTelegramService.channelId, activeTelegramService);
      return;
    }

    adapters.delete(activeTelegramService.channelId);
  };

  const sendChannelText = async (
    target: Parameters<TelegramService["sendText"]>[0],
    text: string
  ): Promise<void> => {
    const adapter = adapters.get(target.channel);

    if (!adapter) {
      throw new Error(`No channel adapter is registered for ${target.channel}`);
    }

    await adapter.sendText(target, text);
  };

  const createConfiguredScheduledTaskService = (config: AppConfig): ScheduledTaskService =>
    new ScheduledTaskService({
      paths,
      logger: scheduledTaskLogger,
      configService: new ScheduledTaskConfigService(paths, config.scheduledTasks.file),
      onTrigger: async ({ taskId, task, scheduledAt }) => {
        const abortController = new AbortController();
        const timeoutMs = task.timeoutMinutes * 60 * 1000;
        const timeoutHandle = setTimeout(() => {
          abortController.abort();
        }, timeoutMs);
        timeoutHandle.unref?.();

        try {
          const result = await agentService.runPrompt(task.prompt, {
            ...buildAgentRunOptions(currentConfig, `scheduled:${taskId}:${scheduledAt}`),
            abortController
          });

          if (result.autoCompacted) {
            const notice = typeof result.autoCompactionPreTokens === "number"
              ? `Scheduled task ${taskId} auto-compacted at about ${result.autoCompactionPreTokens} tokens so the run could continue.`
              : `Scheduled task ${taskId} auto-compacted so the run could continue.`;
            await sendChannelText(toDeliveryTarget(task.delivery), notice);
          }
          if (result.todoNotice) {
            await sendChannelText(toDeliveryTarget(task.delivery), result.todoNotice);
          }
          if (result.text.trim().length > 0) {
            await sendChannelText(toDeliveryTarget(task.delivery), result.text);
          }
        } catch (error) {
          if (abortController.signal.aborted) {
            const message = `Scheduled task ${taskId} timed out after ${task.timeoutMinutes} minute(s) and was stopped.`;
            await sendChannelText(toDeliveryTarget(task.delivery), message);
            throw new ScheduledTaskRunError("timed_out", message, "timeout reached");
          }

          const reason = error instanceof Error ? error.message : String(error);
          await sendChannelText(toDeliveryTarget(task.delivery), `Scheduled task ${taskId} failed: ${reason}`);
          throw new ScheduledTaskRunError("failed", `Scheduled task ${taskId} failed`, reason);
        } finally {
          clearTimeout(timeoutHandle);
        }
      },
      onSkip: async ({ taskId, task, scheduledAt, reason }) => {
        await sendChannelText(
          toDeliveryTarget(task.delivery),
          `Scheduled task ${taskId} was skipped for the run scheduled at ${scheduledAt}: ${reason}.`
        );
      }
    });

  const reconcileTelegramService = async (nextConfig: AppConfig, previousConfig: AppConfig): Promise<void> => {
    const telegramChanged = nextConfig.channels.telegram.enabled !== previousConfig.channels.telegram.enabled
      || nextConfig.channels.telegram.botToken !== previousConfig.channels.telegram.botToken;

    if (!telegramChanged) {
      return;
    }

    if (previousConfig.channels.telegram.enabled) {
      await activeTelegramService.stop();
    }

    if (options.telegramService) {
      activateTelegramService(options.telegramService, nextConfig.channels.telegram.enabled);
      if (nextConfig.channels.telegram.enabled) {
        await activeTelegramService.start();
      }
      return;
    }

    const nextService = nextConfig.channels.telegram.enabled
      ? createTelegramService(nextConfig.channels.telegram.botToken)
      : createTelegramService();

    activateTelegramService(nextService, nextConfig.channels.telegram.enabled);

    if (nextConfig.channels.telegram.enabled) {
      await activeTelegramService.start();
    }
  };

  const reconcileScheduledTaskService = async (nextConfig: AppConfig, previousConfig: AppConfig): Promise<void> => {
    const scheduledTasksChanged =
      nextConfig.scheduledTasks.enabled !== previousConfig.scheduledTasks.enabled ||
      nextConfig.scheduledTasks.file !== previousConfig.scheduledTasks.file;

    if (!scheduledTasksChanged) {
      return;
    }

    if (previousConfig.scheduledTasks.enabled) {
      await activeScheduledTaskService.stop();
    }

    if (options.scheduledTaskService) {
      activeScheduledTaskService = options.scheduledTaskService;
      if (nextConfig.scheduledTasks.enabled) {
        await activeScheduledTaskService.start();
      }
      return;
    }

    activeScheduledTaskService = nextConfig.scheduledTasks.enabled
      ? createConfiguredScheduledTaskService(nextConfig)
      : new ScheduledTaskService({
          paths,
          logger: scheduledTaskLogger
        });

    if (nextConfig.scheduledTasks.enabled) {
      await activeScheduledTaskService.start();
    }
  };

  const reloadService = options.reloadService ?? new ReloadService({
    paths,
    configService,
    logger: configLogger,
    initialConfig: currentConfig,
    applyConfig: async (nextConfig, previousConfig) => {
      currentConfig = nextConfig;
      logger.level = nextConfig.logging.level;
      ipcLogger.level = nextConfig.logging.level;
      configLogger.level = nextConfig.logging.level;
      agentLogger.level = nextConfig.logging.level;
      scheduledTaskLogger.level = nextConfig.logging.level;
      telegramLogger.level = nextConfig.logging.level;

      await reconcileTelegramService(nextConfig, previousConfig);
      await reconcileScheduledTaskService(nextConfig, previousConfig);
    }
  });
  const ipcServer = options.ipcServer ?? new IpcServer({
    paths,
    logger: ipcLogger,
    configService,
    pairingService,
    supportedPairingChannels: ["telegram"],
    reloadConfig: async () => await reloadService.reload("ipc")
  });

  await ipcServer.start();
  shutdownController.add({
    name: "ipc",
    close: async () => ipcServer.stop()
  });
  await reloadService.start();
  shutdownController.add({
    name: "reload",
    close: async () => reloadService.stop()
  });

  if (currentConfig.channels.telegram.enabled) {
    if (options.telegramService) {
      activateTelegramService(options.telegramService, true);
    } else {
      activateTelegramService(createTelegramService(currentConfig.channels.telegram.botToken), true);
    }
    await activeTelegramService.start();
  } else {
    activateTelegramService(activeTelegramService, false);
  }

  if (currentConfig.scheduledTasks.enabled) {
    activeScheduledTaskService = options.scheduledTaskService ?? createConfiguredScheduledTaskService(currentConfig);
    await activeScheduledTaskService.start();
  }

  shutdownController.add({
    name: "telegram",
    close: async () => activeTelegramService.stop()
  });
  shutdownController.add({
    name: "scheduled-tasks",
    close: async () => activeScheduledTaskService.stop()
  });

  shutdownController.add({
    name: "logger",
    close: async () => {
      await logger.flush();
    }
  });

  return {
    paths,
    config: currentConfig,
    configService,
    logger,
    ipcServer,
    pairingService,
    sessionService,
    agentService,
    channelRouter,
    telegramService: activeTelegramService,
    scheduledTaskService: activeScheduledTaskService,
    reloadService,
    shutdownController
  };

  function createTelegramService(token = ""): TelegramService {
    return new TelegramService({
      token,
      ...(options.telegramBot ? { bot: options.telegramBot } : {}),
      ...(options.sendText ? { sendText: options.sendText } : {}),
      ...(options.createTypingHeartbeat ? { createTypingHeartbeat: options.createTypingHeartbeat } : {}),
      logger: telegramLogger
    });
  }
}

function buildAgentRunOptions(config: AppConfig, sessionId: string): ScheduledAgentRunOptions {
  const options: ScheduledAgentRunOptions = {
    cwd: config.runtime.workingDirectory,
    sessionId,
    tools: config.tools.availableTools
  };

  if (config.runtime.model) {
    options.model = config.runtime.model;
  }
  if (config.runtime.maxTurns !== undefined) {
    options.maxTurns = config.runtime.maxTurns;
  }
  if (config.runtime.systemPromptFile) {
    options.systemPromptFile = config.runtime.systemPromptFile;
  }
  if (config.runtime.soulFile) {
    options.soulFile = config.runtime.soulFile;
  }
  if (config.runtime.userFile) {
    options.userFile = config.runtime.userFile;
  }
  if (config.skills.enabled) {
    options.skillDirectories = config.skills.directories;
  }
  options.loadFilesystemSettings = config.runtime.loadFilesystemSettings;

  if (Object.keys(config.mcp.servers).length > 0) {
    options.mcpServers = config.mcp.servers;
  }
  if (Object.keys(config.agents).length > 0) {
    options.agents = config.agents;
  }
  options.memoryEnabled = config.memory.enabled;
  options.memoryMaxLines = config.memory.maxLines;

  return options;
}

function toDeliveryTarget(target: {
  channel: string;
  accountId: string;
  chatType: "direct" | "group" | "channel";
  conversationId: string;
  threadId?: string | undefined;
}) {
  return {
    channel: target.channel,
    accountId: target.accountId,
    chatType: target.chatType,
    conversationId: target.conversationId,
    ...(target.threadId ? { threadId: target.threadId } : {})
  };
}
