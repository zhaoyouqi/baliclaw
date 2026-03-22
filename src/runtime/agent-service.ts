import { appErrorCodes, toAppError } from "../shared/errors.js";
import type { InboundMessage } from "../shared/types.js";
import { buildTelegramDirectSessionId } from "../session/stable-key.js";
import { queryAgent } from "./sdk.js";

export class AgentService {
  async handleMessage(message: InboundMessage, cwd: string, sessionId = buildTelegramDirectSessionId(message)): Promise<string> {
    try {
      return await queryAgent({
        prompt: message.text,
        sessionId,
        cwd
      });
    } catch (error) {
      throw toAppError(error, {
        message: "Failed to query runtime agent",
        code: appErrorCodes.runtimeAgentFailed
      });
    }
  }
}
