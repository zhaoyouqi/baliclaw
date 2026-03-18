import { readJson5FileOrDefault, writeJson5File } from "../config/file-store.js";
import { getAppPaths } from "../config/paths.js";

export interface PairingStoreData {
  approvedSenderIds: string[];
}

export class PairingStore {
  private readonly file = getAppPaths().allowlistFile;

  async load(): Promise<PairingStoreData> {
    return readJson5FileOrDefault<PairingStoreData>(this.file, { approvedSenderIds: [] });
  }

  async save(data: PairingStoreData): Promise<void> {
    await writeJson5File(this.file, data);
  }
}
