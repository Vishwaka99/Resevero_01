import type { DataStore } from "./ports";
import { memoryStore } from "./memory";

/** The single place that decides which adapter the app runs on. */
export type DataAdapterName = "memory" | "postgres";

export function dataAdapterName(): DataAdapterName {
  return process.env.DATA_ADAPTER === "postgres" ? "postgres" : "memory";
}

export function getDataStore(): DataStore {
  if (dataAdapterName() === "postgres") {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATA_ADAPTER=postgres but DATABASE_URL is not set. Copy the pooled connection string from " +
          "Supabase > Project Settings > Database into .env.local, or set DATA_ADAPTER=memory.",
      );
    }
    // Required lazily: loading the driver is pointless on the memory adapter,
    // and it must never be pulled into a bundle that does not need it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require("./postgres") as typeof import("./postgres")).postgresStore;
  }
  return memoryStore;
}

export type { DataStore };
export * from "./ports";
