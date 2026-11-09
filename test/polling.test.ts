import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ParanodPlugin } from "../src/core/plugin";
import { ExpressServer } from "../src/server/express";
import { HMACUtils, buildRequestCanonicalPayload } from "../src/security/hmac";
import {
  EncryptedFilePollingJobStorage,
  MemoryPollingJobStorage,
  type PollingJob,
} from "../src/jobs/storage";
import { PollingJobTracker, POLLING_RESULT_TTL_MS } from "../src/jobs/polling";

let server: http.Server | undefined;
let directory: string | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (server)
    await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
  if (directory) await fs.rm(directory, { recursive: true, force: true });
  directory = undefined;
});

function headers(body: string, workspaceId: string, secret: string) {
  const timestamp = String(Date.now()),
    nonce = randomBytes(16).toString("hex");
  return {
    "Content-Type": "application/json",
    "X-Relazio-Workspace-Id": workspaceId,
    "X-Relazio-Timestamp": timestamp,
    "X-Relazio-Nonce": nonce,
    "X-Relazio-Signature": new HMACUtils(secret).generateHeader(
      buildRequestCanonicalPayload(body, workspaceId, timestamp, nonce),
    ),
  };
}

async function fixture() {
  vi.stubEnv("NODE_ENV", "production");
  const plugin = new ParanodPlugin({
    id: "poll-test",
    name: "Poll test",
    description: "Fixture",
    version: "1.0.0",
    author: "Test",
    category: "network",
  });
  plugin.enableMultiTenantInMemory();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const handler = vi.fn(async (_input, _config, job) => {
    await job.updateProgress(25, "Working");
    await gate;
    return {
      entities: [{ id: "out", type: "ip" as const, value: "192.0.2.10" }],
      edges: [],
    };
  });
  plugin.asyncTransform({
    id: "scan",
    name: "Scan",
    description: "Fixture",
    inputType: "domain",
    outputTypes: ["ip"],
    handler,
  });
  plugin.transform({
    id: "sync",
    name: "Sync",
    description: "Fixture",
    inputType: "domain",
    outputTypes: ["ip"],
    handler: async () => ({ entities: [], edges: [] }),
  });
  const adapter = new ExpressServer(plugin, {
    port: 0,
    publicUrl: "https://addon.example",
    multiTenant: true,
    installationToken: "i".repeat(32),
  });
  server = http.createServer(adapter.getApp());
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("Missing port");
  const base = `http://127.0.0.1:${addr.port}`;
  const register = async (
    workspaceId: string,
    platformUrl = "http://localhost:3002",
  ) => {
    const response = await fetch(base + "/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + "i".repeat(32),
      },
      body: JSON.stringify({ workspaceId, platformUrl }),
    });
    expect(response.status).toBe(200);
    return (await response.json()).webhookSecret as string;
  };
  const secret = await register("one");
  const send = async (
    route: string,
    value: unknown,
    workspaceId = "one",
    key = secret,
  ) => {
    const body = JSON.stringify(value);
    return fetch(base + route, {
      method: "POST",
      body,
      headers: headers(body, workspaceId, key),
    });
  };
  const input = { entity: { id: "in", type: "domain", value: "example.test" } };
  return { plugin, base, register, secret, send, input, release, handler };
}

describe("outbound-only addon protocol", () => {
  it("registers an HTTP localhost platform in production and returns sync results without callbacks", async () => {
    const f = await fixture();
    const res = await f.send("/sync", { transformId: "sync", input: f.input });
    expect(res.status).toBe(200);
    expect((await res.json()).async).toBe(false);
  });

  it("queues once, isolates ownership, and retains completed results for repeated signed polling", async () => {
    const f = await fixture();
    const spy = vi.spyOn(globalThis, "fetch");
    const secondSecret = await f.register("two", "http://192.168.1.50:3002");
    const created = await f.send("/scan", {
      transformId: "scan",
      input: f.input,
      resultDelivery: "polling",
    });
    expect(created.status).toBe(200);
    const { jobId } = await created.json();
    const status = { action: "status", jobId, transformId: "scan" };
    expect(
      (await f.send("/jobs/status", status, "two", secondSecret)).status,
    ).toBe(404);
    expect(
      (await f.send("/jobs/status", { ...status, transformId: "other" }))
        .status,
    ).toBe(404);
    expect(
      (await f.send("/jobs/status", status, "one", "wrong-secret")).status,
    ).toBe(401);
    const before = await f.send("/jobs/status", status);
    expect(before.headers.get("cache-control")).toBe("no-store");
    expect(await before.json()).toMatchObject({
      jobId,
      transformId: "scan",
      status: "processing",
    });
    f.release();
    await vi.waitFor(async () =>
      expect((await f.plugin.getPollingJob(jobId, "one", "scan"))?.status).toBe(
        "completed",
      ),
    );
    const finished = await (await f.send("/jobs/status", status)).json();
    expect(finished).toMatchObject({
      jobId,
      status: "completed",
      result: { success: true, entities: [{ value: "192.0.2.10" }] },
    });
    expect(finished).not.toHaveProperty("workspaceId");
    expect(await (await f.send("/jobs/status", status)).json()).toEqual(
      finished,
    );
    expect(f.handler).toHaveBeenCalledOnce();
    expect(
      spy.mock.calls.every(([url]) => String(url).startsWith(f.base + "/")),
    ).toBe(true);
  });

  it("requires a status-specific signed body and rejects replayed status requests", async () => {
    const f = await fixture();
    const body = JSON.stringify({
      action: "status",
      jobId: "unknown",
      transformId: "scan",
    });
    const signed = headers(body, "one", f.secret);
    expect(
      (
        await fetch(f.base + "/jobs/status", {
          method: "POST",
          headers: signed,
          body,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await fetch(f.base + "/jobs/status", {
          method: "POST",
          headers: signed,
          body,
        })
      ).status,
    ).toBe(409);
    expect(
      (await f.send("/jobs/status", { transformId: "scan", input: f.input }))
        .status,
    ).toBe(400);
    expect(
      (
        await fetch(f.base + "/jobs/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        })
      ).status,
    ).toBe(401);
  });

  it("does not let HTTP registration authorize cleartext callbacks or mix transports", async () => {
    const f = await fixture();
    const callbackUrl = "http://localhost:3002/api/webhooks/transforms/job";
    expect(
      (
        await f.send("/scan", {
          transformId: "scan",
          input: f.input,
          callbackUrl,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await f.send("/scan", {
          transformId: "scan",
          input: f.input,
          resultDelivery: "polling",
          callbackUrl,
        })
      ).status,
    ).toBe(400);
    expect(f.handler).not.toHaveBeenCalled();
  });

  it("advertises a same-origin polling endpoint while preserving legacy callbacks", async () => {
    const f = await fixture();
    const manifest = f.plugin.generateManifest({
      endpoint: "https://addon.example/prefix",
    });
    expect(
      manifest.plugin.transforms.find((t) => t.id === "scan"),
    ).toMatchObject({
      async: true,
      pollingEndpoint: "https://addon.example/prefix/jobs/status",
    });
    expect(
      manifest.plugin.transforms.find((t) => t.id === "sync"),
    ).not.toHaveProperty("pollingEndpoint");
    const secret = await f.register("legacy", "https://platform.example");
    const nativeFetch = globalThis.fetch;
    const callbacks: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url).startsWith("https://platform.example/")) {
        callbacks.push(JSON.parse(String(init?.body)));
        return new Response("{}");
      }
      return nativeFetch(url, init);
    });
    const response = await f.send(
      "/scan",
      {
        transformId: "scan",
        input: f.input,
        callbackUrl:
          "https://platform.example/api/webhooks/transforms/platform-job",
      },
      "legacy",
      secret,
    );
    expect(response.status).toBe(200);
    f.release();
    await vi.waitFor(() =>
      expect(
        callbacks.some(
          (p: any) => p.status === "completed" && p.jobId === "platform-job",
        ),
      ).toBe(true),
    );
  });
});

describe("polling result storage", () => {
  function record(): PollingJob {
    return {
      jobId: "job",
      workspaceId: "one",
      transformId: "scan",
      status: "processing",
      expiresAt: Date.now() + POLLING_RESULT_TTL_MS,
    };
  }
  it("persists encrypted results across storage recreation and removes expired records", async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "paranod-polling-"));
    const file = path.join(directory, "jobs.enc"),
      key = "k".repeat(32);
    const initial = {
      ...record(),
      status: "completed" as const,
      result: {
        success: true,
        entities: [
          { id: "out", type: "domain" as const, value: "private.example.test" },
        ],
        edges: [],
      },
    };
    await new EncryptedFilePollingJobStorage(file, key).save(initial);
    expect(await fs.readFile(file, "utf8")).not.toContain(
      "private.example.test",
    );
    expect((await fs.stat(file)).mode & 0o777).toBe(0o600);
    const reloaded = new EncryptedFilePollingJobStorage(file, key);
    expect(await reloaded.get("job")).toEqual(initial);
    await expect(
      new EncryptedFilePollingJobStorage(file, "wrong".repeat(10)).get("job"),
    ).rejects.toThrow();
    const time = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(time + POLLING_RESULT_TTL_MS + 1);
    expect(await reloaded.get("job")).toBeNull();
  });
  it("serializes concurrent progress and preserves a terminal result", async () => {
    const storage = new MemoryPollingJobStorage(),
      initial = record();
    await storage.save(initial);
    const tracker = new PollingJobTracker(initial, storage);
    await Promise.all([
      tracker.updateProgress(30, "Progress"),
      tracker.complete({ success: true, entities: [], edges: [] }),
      tracker.updateProgress(80, "Late"),
      tracker.fail("Late error"),
    ]);
    expect(await storage.get("job")).toMatchObject({
      status: "completed",
      progress: 100,
      result: { success: true },
    });
  });
  it("bounds result size and capacity without evicting accepted jobs", async () => {
    const storage = new MemoryPollingJobStorage(),
      initial = record();
    for (let i = 0; i < 256; i++)
      await storage.save({ ...initial, jobId: String(i) });
    await expect(
      storage.save({ ...initial, jobId: "overflow" }),
    ).rejects.toThrow("capacity");
    expect(await storage.get("0")).not.toBeNull();
    const tracker = new PollingJobTracker({ ...initial, jobId: "0" }, storage);
    await expect(
      tracker.complete({
        entities: [],
        edges: [],
        message: "x".repeat(4 * 1024 * 1024),
      }),
    ).rejects.toThrow("size");
  });
});
