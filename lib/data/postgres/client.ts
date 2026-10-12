import { AsyncLocalStorage } from "node:async_hooks";
import postgres from "postgres";

/**
 * The Postgres connection, and the transaction context the repositories read.
 *
 * `DataStore.runInTransaction(work)` takes a callback with no arguments, so
 * the repositories have to find the open transaction some other way. They read
 * it from async context: `runInTransaction` puts the transaction's connection
 * into an `AsyncLocalStorage`, and every query goes through `db()`, which
 * returns that connection when one is open and the pool otherwise. A write and
 * its audit row therefore land together without any of the services having to
 * pass a handle around.
 */

/** The connection handle, exactly as the driver infers it. */
export type Sql = ReturnType<typeof postgres>;
type Options = NonNullable<Parameters<typeof postgres>[1]>;

const GLOBAL_KEY = "__reservo_postgres__";

type Holder = typeof globalThis & {
  [GLOBAL_KEY]?: { sql: Sql; url: string };
};

const transactionContext = new AsyncLocalStorage<Sql>();

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy the pooled connection string from Supabase > Project Settings > Database into .env.local.",
    );
  }
  return url;
}

/**
 * The pool. Held on `globalThis` so Next.js hot reloads reuse one pool rather
 * than opening a new one on every edit.
 */
export function pool(): Sql {
  const holder = globalThis as Holder;
  const url = databaseUrl();

  // A changed URL (switching environments) should open a new pool.
  if (holder[GLOBAL_KEY] && holder[GLOBAL_KEY].url !== url) {
    void holder[GLOBAL_KEY].sql.end({ timeout: 5 });
    delete holder[GLOBAL_KEY];
  }

  if (!holder[GLOBAL_KEY]) {
    holder[GLOBAL_KEY] = { url, sql: connect(url) };
  }
  return holder[GLOBAL_KEY].sql;
}

export function connect(url: string, options: Options = {}): Sql {
  return postgres(url, {
    // Supabase's transaction-mode pooler (port 6543) hands a different backend
    // to each transaction, so server-side prepared statements cannot be reused.
    prepare: false,
    ssl: "require",
    max: 10,
    idle_timeout: 20,
    connect_timeout: 15,
    // Timestamps come back as JavaScript Dates in UTC; all display formatting
    // happens in lib/domain/time.ts.
    onnotice: () => {},
    ...options,
  });
}

/** The connection a query should use: the open transaction, or the pool. */
export function db(): Sql {
  return transactionContext.getStore() ?? pool();
}

/** True while a transaction is open on this async context. */
export function inTransaction(): boolean {
  return transactionContext.getStore() !== undefined;
}

/**
 * Runs `work` inside a transaction. Nested calls join the transaction already
 * open rather than starting a second one, so a service that calls another
 * service still commits once.
 */
export async function runInTransaction<T>(work: () => Promise<T>): Promise<T> {
  const open = transactionContext.getStore();
  if (open) return work();

  // postgres.js types a transaction handle separately from the pool, though
  // the query surface the repositories use is the same.
  return pool().begin(async (tx) => transactionContext.run(tx as unknown as Sql, work)) as Promise<T>;
}

/** Closes the pool. For scripts and tests; the server keeps its pool open. */
export async function closePool(): Promise<void> {
  const holder = globalThis as Holder;
  if (holder[GLOBAL_KEY]) {
    await holder[GLOBAL_KEY].sql.end({ timeout: 5 });
    delete holder[GLOBAL_KEY];
  }
}

/** Postgres error codes the adapter reacts to by name rather than by number. */
export const PG_ERROR = {
  /** An exclusion constraint was violated — the slot is already taken. */
  exclusionViolation: "23P01",
  uniqueViolation: "23505",
  checkViolation: "23514",
  foreignKeyViolation: "23503",
} as const;

export function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : undefined;
}
