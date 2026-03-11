import { PairingStore } from "./pairing-store.js";

export class PairingService {
  constructor(private readonly store = new PairingStore()) {}

  async listApprovedSenders(): Promise<string[]> {
    const data = await this.store.load();
    return data.approvedSenderIds;
  }

  async approve(senderId: string): Promise<void> {
    const data = await this.store.load();
    if (!data.approvedSenderIds.includes(senderId)) {
      data.approvedSenderIds.push(senderId);
      await this.store.save(data);
    }
  }
}

