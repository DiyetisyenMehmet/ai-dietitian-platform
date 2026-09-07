import { env } from "../../config/env";
import { LocalStorageProvider } from "./local-storage.provider";
import type { StorageProvider } from "./storage.types";

export type {
  GetObjectResult,
  PutObjectInput,
  StorageProvider,
  StoredObjectRef,
  StorageErrorCode,
} from "./storage.types";
export { StorageError } from "./storage.types";

let provider: StorageProvider | null = null;

/** Returns the configured storage provider as a process-wide singleton. */
export function getStorageProvider(): StorageProvider {
  if (provider) return provider;

  switch (env.STORAGE_PROVIDER) {
    case "local":
      provider = new LocalStorageProvider(env.STORAGE_LOCAL_ROOT);
      return provider;
  }
}
