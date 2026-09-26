/* eslint-disable no-await-in-loop -- Sequential requests exercise the rate window without hitting concurrency limits. */
import { Effect, Layer, Redacted } from "effect";
import { HttpClient, HttpClientResponse, HttpRouter, HttpServer } from "effect/unstable/http";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ServerConfig } from "../../src/config.js";
import { HealthRoutes } from "../../src/routes/health.js";
import { ReferenceRoutes } from "../../src/routes/reference.js";
import { RpcRoutes } from "../../src/routes/rpc.js";

const disposals: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(disposals.splice(0).map((dispose) => dispose()));
});

function setup(key = "test-key", status = 200) {
  const upstream = vi.fn((request: { url: string }) => request.url);
  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      upstream(request);
      return HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify({ jsonrpc: "2.0", id: 7, result: "0xaa36a7" }), { status }),
      );
    }),
  );
  const web = HttpRouter.toWebHandler(
    Layer.mergeAll(HealthRoutes, ReferenceRoutes, RpcRoutes).pipe(
      Layer.provide([
        Layer.succeed(ServerConfig, {
          host: "127.0.0.1",
          port: 3001,
          alchemyKey: Redacted.make(key),
          pimlicoUrl: Redacted.make(""),
          sponsorshipPolicy: "",
        }),
        Layer.succeed(HttpClient.HttpClient, client),
        HttpServer.layerServices,
      ]),
    ),
    { disableLogger: true },
  );
  disposals.push(web.dispose);
  const post = (body: unknown, chain = "11155111") =>
    web.handler(
      new Request(`http://localhost/rpc/${chain}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  return { ...web, post, upstream };
}

const call = { jsonrpc: "2.0", id: 7, method: "eth_chainId", params: [] };

describe("server routes", () => {
  it("serves the generated OpenAPI spec at root and its canonical path", async () => {
    const app = setup();
    const root = await app.handler(new Request("http://localhost/"));
    const spec = await root.json();
    expect(spec).toHaveProperty(["paths", "/rpc/{chainId}"]);
    expect(spec).toHaveProperty(["paths", "/health"]);
    expect(spec).toHaveProperty(["paths", "/health/ready"]);
    for (const path of ["nonce", "message", "verify", "session", "logout"]) {
      expect(spec).toHaveProperty(["paths", `/auth/${path}`]);
    }
    expect(await (await app.handler(new Request("http://localhost/openapi.json"))).json()).toEqual(
      spec,
    );
  });
  it("keeps liveness independent of RPC configuration", async () => {
    const app = setup("");
    expect((await app.handler(new Request("http://localhost/health"))).status).toBe(200);
    expect((await app.handler(new Request("http://localhost/health/ready"))).status).toBe(503);
    expect((await app.post(call)).status).toBe(503);
    expect(app.upstream).not.toHaveBeenCalled();
  });

  it("serves the bundled Scalar reference", async () => {
    const response = await setup().handler(new Request("http://localhost/reference"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("Scalar.createApiReference");
  });

  it("forwards to the fixed Alchemy network and preserves JSON-RPC results", async () => {
    const app = setup();
    const response = await app.post(call);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ jsonrpc: "2.0", id: 7, result: "0xaa36a7" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    await app.post([call], "11155111");
    expect(app.upstream).toHaveReturnedWith("https://eth-sepolia.g.alchemy.com/v2/test-key");
  });

  it("rejects unknown chains, writes, invalid versions and oversized batches", async () => {
    const app = setup();
    for (const chain of ["1", "01", "0", "137", "constructor", "9007199254740993"]) {
      expect((await app.post(call, chain)).status).toBe(400);
    }
    for (const body of [
      [],
      Array.from({ length: 21 }, () => call),
      { ...call, method: "eth_sendRawTransaction" },
      { ...call, jsonrpc: "1.0" },
    ]) {
      expect((await app.post(body)).status).toBe(400);
    }
    expect(app.upstream).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and unsupported content types", async () => {
    const app = setup();
    const response = await app.handler(
      new Request("http://localhost/rpc/11155111", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    );
    expect(response.status).toBe(400);
    expect(
      (
        await app.handler(
          new Request("http://localhost/rpc/11155111", { method: "POST", body: "{}" }),
        )
      ).status,
    ).toBe(415);
  });

  it("does not expose upstream authentication failures", async () => {
    expect((await setup("secret", 401).post(call)).status).toBe(502);
    expect((await setup("secret", 429).post(call)).status).toBe(429);
  });

  it("rejects oversized requests before forwarding", async () => {
    const app = setup();
    expect((await app.post({ ...call, params: ["x".repeat(70_000)] })).status).toBe(413);
    expect(app.upstream).not.toHaveBeenCalled();
  });

  it("limits public requests per process", async () => {
    const app = setup();
    for (let index = 0; index < 120; index++) await app.post(call);
    expect((await app.post(call)).status).toBe(429);
    expect(app.upstream).toHaveBeenCalledTimes(120);
  });
});
