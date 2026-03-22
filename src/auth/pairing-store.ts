import { readJson5FileOrDefault, writeJson5File } from "../config/file-store.js";
import { getAppPaths, type AppPaths } from "../config/paths.js";
import type { PairingRequest } from "../shared/types.js";

export interface PairingStoreData {
  approvedSenderIds: string[];
}

export interface PendingPairingStoreData {
  requests: PairingRequest[];
}

const defaultAllowlistData = (): PairingStoreData => ({
  approvedSenderIds: []
});

const defaultPendingData = (): PendingPairingStoreData => ({
  requests: []
});

export class PairingStore {
  constructor(private readonly paths: AppPaths = getAppPaths()) {}

  async load(): Promise<PairingStoreData> {
    return this.loadAllowlist();
  }

  async save(data: PairingStoreData): Promise<void> {
    await this.saveAllowlist(data);
  }

  async loadAllowlist(): Promise<PairingStoreData> {
    return readJson5FileOrDefault<PairingStoreData>(this.paths.allowlistFile, defaultAllowlistData());
  }

  async saveAllowlist(data: PairingStoreData): Promise<void> {
    await writeJson5File(this.paths.allowlistFile, data);
  }

  async loadPendingRequests(): Promise<PendingPairingStoreData> {
    return readJson5FileOrDefault<PendingPairingStoreData>(
      this.paths.pendingPairingFile,
      defaultPendingData()
    );
  }

  async savePendingRequests(data: PendingPairingStoreData): Promise<void> {
    await writeJson5File(this.paths.pendingPairingFile, data);
  }
}
