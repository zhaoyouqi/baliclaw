import { ConfigService } from "../config/service.js";

export interface BootstrapContext {
  configService: ConfigService;
}

export function bootstrap(): BootstrapContext {
  return {
    configService: new ConfigService()
  };
}

