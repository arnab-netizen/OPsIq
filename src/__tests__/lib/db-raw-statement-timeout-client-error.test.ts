/**
 * F-IDLE-TXN-CLIENT-ERROR: withRawStatementTimeout() must own the 'error'
 * event of the client it has checked out.
 *
 * pg-pool removes its own 'error' listener from a client while it is checked
 * out, and node-postgres emits 'error' on the client when the backend
 * terminates the connection while no query is active (e.g. SQLSTATE 25P03,
 * the idle_in_transaction_session_timeout that withRawStatementTimeout()
 * itself sets to the same margin as its client-side backstop). An EventEmitter
 * 'error' with no listener throws -> uncaughtException. These tests pin the
 * contract against a real EventEmitter-based client double (so a missing
 * listener really throws, exactly like node-postgres), with no database.
 * The same scenario against real PostgreSQL lives in
 * db-raw-statement-timeout-hostile.db.test.ts.
 */

import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CLIENT_SIDE_BACKSTOP_MARGIN_MS,
  ClientSideExecutionTimeoutError,
  withRawStatementTimeout,
} from "@/lib/db";

class FakePgClient extends EventEmitter {
  released: Array<Error | undefined> = [];
  queries: string[] = [];
  /** When set, every query after BEGIN/SET LOCAL rejects like a dead pg client. */
  dead = false;

  query = async (text: string): Promise<{ rows: unknown[]; command?: string }> => {
    this.queries.push(text);
    if (this.dead) {
      throw new Error("Client has encountered a connection error and is not queryable");
    }
    return { rows: [], command: text === "COMMIT" ? "COMMIT" : undefined };
  };

  release = (err?: Error): void => {
    this.released.push(err);
  };

  /** node-postgres semantics: the server FATAL arrives as an 'error' event. */
  serverTerminates(): void {
    this.dead = true;
    const fatal = Object.assign(new Error("terminating connection due to idle-in-transaction timeout"), {
      code: "25P03",
      severity: "FATAL",
    });
    this.emit("error", fatal);
  }
}

function poolOf(client: FakePgClient) {
  return { connect: async () => client as unknown as Parameters<typeof withRawStatementTimeout>[0] extends { connect: () => Promise<infer C> } ? C : never };
}

describe("withRawStatementTimeout() owns the checked-out client's 'error' event (F-IDLE-TXN-CLIENT-ERROR)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers exactly one 'error' listener while fn runs and removes it again on a clean release (no accumulation on a reused client)", async () => {
    const client = new FakePgClient();
    let during = -1;
    await withRawStatementTimeout(
      poolOf(client),
      1_000,
      async () => {
        during = client.listenerCount("error");
        return "ok";
      },
      "listener-lifecycle",
    );
    expect(during).toBe(1);
    expect(client.listenerCount("error")).toBe(0);
    expect(client.released).toEqual([undefined]);

    // Reuse the same client many times: still no accumulation.
    for (let i = 0; i < 15; i += 1) {
      await withRawStatementTimeout(poolOf(client), 1_000, async () => "ok", `reuse-${i}`);
    }
    expect(client.listenerCount("error")).toBe(0);
  });

  it("a server-initiated FATAL while the client is checked out is absorbed by the listener (an EventEmitter 'error' with no listener would throw); the failure still reaches the caller and the client is discarded, not reused", async () => {
    const client = new FakePgClient();
    const outcome = withRawStatementTimeout(
      poolOf(client),
      1_000,
      async (c) => {
        // fn is between statements: the server kills the idle-in-transaction backend.
        client.serverTerminates();
        return c.query("SELECT 1");
      },
      "fatal-while-checked-out",
    );
    await expect(outcome).rejects.toThrow(/not queryable/);
    // ROLLBACK could not be confirmed on the dead client -> discarded with the error.
    expect(client.released).toHaveLength(1);
    expect(client.released[0]).toBeInstanceOf(Error);
  });

  it("a hung fn on a connection the server already terminated rejects with the typed backstop error at statementTimeoutMs + margin, attributed to SQLSTATE 25P03", async () => {
    const client = new FakePgClient();
    const statementTimeoutMs = 300;
    let settled: unknown;
    const outcome = withRawStatementTimeout(
      poolOf(client),
      statementTimeoutMs,
      async () => {
        client.serverTerminates();
        return new Promise<never>(() => undefined);
      },
      "hung-after-fatal",
    ).catch((e: unknown) => {
      settled = e;
    });

    // Not before the margin: the protection is not shortened...
    await vi.advanceTimersByTimeAsync(statementTimeoutMs + CLIENT_SIDE_BACKSTOP_MARGIN_MS - 1);
    expect(settled).toBeUndefined();
    // ...and it does fire at the margin: the protection is not weakened.
    await vi.advanceTimersByTimeAsync(2);
    await outcome;

    expect(settled).toBeInstanceOf(ClientSideExecutionTimeoutError);
    expect((settled as ClientSideExecutionTimeoutError).connectionErrorCode).toBe("25P03");
    expect(client.released).toHaveLength(1);
    expect(client.released[0]).toBeInstanceOf(ClientSideExecutionTimeoutError);
    // The discarded client keeps an owner for a late FATAL/socket error.
    expect(client.listenerCount("error")).toBe(1);
    expect(() => client.emit("error", new Error("late socket error"))).not.toThrow();
  });

  it("a hung fn with NO connection error keeps the unchanged typed backstop error and no SQLSTATE attribution", async () => {
    const client = new FakePgClient();
    let settled: unknown;
    const outcome = withRawStatementTimeout(poolOf(client), 300, () => new Promise<never>(() => undefined), "hung-live").catch(
      (e: unknown) => {
        settled = e;
      },
    );
    await vi.advanceTimersByTimeAsync(300 + CLIENT_SIDE_BACKSTOP_MARGIN_MS + 1);
    await outcome;
    expect(settled).toBeInstanceOf(ClientSideExecutionTimeoutError);
    expect((settled as ClientSideExecutionTimeoutError).connectionErrorCode).toBeUndefined();
  });

  it("stays compatible with minimal client doubles that implement only query()/release() (no EventEmitter surface)", async () => {
    const released: Array<Error | undefined> = [];
    const minimal = {
      query: async (text: string) => ({ rows: [], command: text === "COMMIT" ? "COMMIT" : undefined }),
      release: (err?: Error) => {
        released.push(err);
      },
    };
    await expect(
      withRawStatementTimeout({ connect: async () => minimal }, 1_000, async () => "ok", "minimal-double"),
    ).resolves.toBe("ok");
    expect(released).toEqual([undefined]);
  });
});
