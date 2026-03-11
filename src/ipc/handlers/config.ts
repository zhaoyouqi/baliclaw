import { ConfigService } from "../../config/service.js";
import type { AppConfig } from "../../config/schema.js";

export async function handleConfigGet(configService: ConfigService): Promise<AppConfig> {
  return configService.load();
}

