import type { DeliveryTarget } from "../shared/types.js";

export async function sendTelegramText(target: DeliveryTarget, text: string): Promise<void> {
  void target;
  void text;
  await Promise.resolve();
}

