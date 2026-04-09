import type { PairingService } from "../../auth/pairing-service.js";
import type { PairingRequest } from "../../shared/types.js";

export async function handlePairingList(pairingService: PairingService, channel: string): Promise<PairingRequest[]> {
  return pairingService.listPendingRequests(channel);
}

export async function handlePairingApprove(
  pairingService: PairingService,
  channel: string,
  code: string
): Promise<PairingRequest> {
  return pairingService.approve(channel, code);
}
