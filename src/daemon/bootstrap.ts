import { PairingService } from "../auth/pairing-service.js";
import type { Logger } from "pino";
import { ConfigService } from "../config/service.js";
import { ensureStateDirectories, getAppPaths, type AppPaths } from "../config/paths.js";
import type { AppConfig } from "../config/schema.js";
import { IpcServer } from "../ipc/server.js";
import { AgentService } from "../runtime/agent-service.js";
import { SessionService } from "../session/service.js";
import { createTelegramApi, sendTelegramText } from "../telegram/send.js";
import { TelegramService, type TelegramPollingBot } from "../telegram/service.js";
import { getLogger } from "../shared/logger.js";
import { ReloadService } from "./reload-service.js";
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
  telegramService: TelegramService;
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
  reloadService?: ReloadService;
  sendText?: (target: Parameters<typeof sendTelegramText>[0], text: string) => Promise<void>;
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
  const telegramLogger = getLogger("telegram", {
    level: currentConfig.logging.level
  });
  const pairingService = options.pairingService ?? new PairingService();
  const sessionService = options.sessionService ?? new SessionService();
  const agentService = options.agentService ?? new AgentService({
    logger: agentLogger
  });
  let activeTelegramService = options.telegramService ?? new TelegramService();
  const shutdownController = createShutdownController(logger);
  const sendText = options.sendText ?? (async (target, text) => {
    await sendTelegramText(target, text, createTelegramApi(currentConfig.telegram.botToken));
  });

  const createConfiguredTelegramService = (config: AppConfig): TelegramService => {
    const telegramServiceOptions: ConstructorParameters<typeof TelegramService>[0] = {
      token: config.telegram.botToken,
      pairingService,
      logger: telegramLogger,
      enqueueInbound: async (message) => {
        await sessionService.runTurn(message, async (turnMessage, sessionId) => {
          const runtimeConfig = currentConfig;
          const agentRunOptions = buildAgentRunOptions(runtimeConfig, sessionId);
          const reply = await agentService.handleMessage(turnMessage, agentRunOptions);

          if (reply.trim().length === 0) {
            return;
          }

          await sendText(
            {
              channel: turnMessage.channel,
              accountId: turnMessage.accountId,
              chatType: turnMessage.chatType,
              conversationId: turnMessage.conversationId
            },
            reply
          );
        });
      },
      sendText
    };

    if (options.telegramBot) {
      telegramServiceOptions.bot = options.telegramBot;
    }

    return new TelegramService(telegramServiceOptions);
  };

  const reconcileTelegramService = async (nextConfig: AppConfig, previousConfig: AppConfig): Promise<void> => {
    const telegramChanged = nextConfig.telegram.enabled !== previousConfig.telegram.enabled
      || nextConfig.telegram.botToken !== previousConfig.telegram.botToken;

    if (!telegramChanged) {
      return;
    }

    if (previousConfig.telegram.enabled) {
      await activeTelegramService.stop();
    }

    if (options.telegramService) {
      activeTelegramService = options.telegramService;
      if (nextConfig.telegram.enabled) {
        await activeTelegramService.start();
      }
      return;
    }

    activeTelegramService = nextConfig.telegram.enabled
      ? createConfiguredTelegramService(nextConfig)
      : new TelegramService();

    if (nextConfig.telegram.enabled) {
      await activeTelegramService.start();
    }
  };

  const reloadService = options.reloadService ?? new ReloadService({
    paths,
    configService,
    logger: configLogger,
    initialConfig: currentConfig,
    applyConfig: async (nextConfig, previousConfig) => {
      logger.level = nextConfig.logging.level;
      ipcLogger.level = nextConfig.logging.level;
      configLogger.level = nextConfig.logging.level;
      agentLogger.level = nextConfig.logging.level;
      telegramLogger.level = nextConfig.logging.level;

      await reconcileTelegramService(nextConfig, previousConfig);
      currentConfig = nextConfig;
    }
  });
  const ipcServer = options.ipcServer ?? new IpcServer({
    paths,
    logger: ipcLogger,
    configService,
    pairingService,
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

  if (currentConfig.telegram.enabled) {
    activeTelegramService = options.telegramService ?? createConfiguredTelegramService(currentConfig);
    await activeTelegramService.start();
  }

  shutdownController.add({
    name: "telegram",
    close: async () => activeTelegramService.stop()
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
    telegramService: activeTelegramService,
    reloadService,
    shutdownController
  };
}

function buildAgentRunOptions(config: AppConfig, sessionId: string): Parameters<AgentService["handleMessage"]>[1] {
  const options: Exclude<Parameters<AgentService["handleMessage"]>[1], string> = {
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
  if (config.skills.enabled) {
    options.skillDirectories = config.skills.directories;
  }

  return options;
}
