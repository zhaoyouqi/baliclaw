import type { PairingService } from "../../auth/pairing-service.js";

export async function handlePairingList(pairingService: PairingService): Promise<string[]> {
  return pairingService.listApprovedSenders();
}

