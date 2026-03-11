import type { InboundMessage } from "../shared/types.js";
import { buildTelegramDirectSessionId } from "../session/stable-key.js";
import { queryAgent } from "./sdk.js";

export class AgentService {
  async handleMessage(message: InboundMessage, cwd: string): Promise<string> {
    return queryAgent({
      prompt: message.text,
      sessionId: buildTelegramDirectSessionId(message),
      cwd
    });
  }
}

