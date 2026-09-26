import { ByteSize, Effect, Layer, Redacted, Schema } from "effect";
import {
  HttpClient,
  HttpClientRequest,
  HttpIncomingMessage,
  HttpRouter,
  HttpServerResponse,
} from "effect/unstable/http";

import {
  Auth,
  AuthConfig,
  VerificationClient,
  validateSponsorshipRequest,
} from "@ens-social-verification/application";
import { Unauthenticated } from "@ens-social-verification/protocol/errors";
import { SponsorshipRpcRequest } from "@ens-social-verification/protocol/schema";

import { ServerConfig } from "../../config.js";
import { readAuthBody } from "../../helpers/auth-body.js";
import { authCookies } from "../../helpers/auth-cookie.js";
import { RecordVerificationLive } from "../../layers/services.js";
import { isDefinitiveRejection } from "./rejection.js";

const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
const rejected = (status: number, message: string, notSubmitted = true) =>
  HttpServerResponse.jsonUnsafe({ error: { message, notSubmitted } }, { status, headers });

export const SponsorshipRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    const authConfig = yield* AuthConfig;
    const auth = yield* Auth;
    const sdk = yield* VerificationClient;
    const client = yield* HttpClient.HttpClient;
    const url = Redacted.value(config.pimlicoUrl).trim();
    const enabled = Boolean(
      config.sponsorshipPolicy &&
      /^https:\/\/api\.pimlico\.io\/v2\/11155111\/rpc\?apikey=[^\s]+$/.test(url),
    );
    let active = 0;
    let requests = 0;
    let windowStart = 0;
    return Layer.mergeAll(
      HttpRouter.add("GET", "/sponsorship/configuration", () =>
        Effect.succeed(HttpServerResponse.jsonUnsafe({ enabled }, { headers })),
      ),
      HttpRouter.add("POST", "/sponsorship/:name/rpc", (request) =>
        Effect.gen(function* () {
          if (request.headers.origin !== authConfig.origin) return rejected(403, "Invalid origin");
          if (!enabled) return rejected(503, "Sponsorship is not configured");
          const now = Date.now();
          if (now - windowStart > 60_000) {
            requests = 0;
            windowStart = now;
          }
          if (active >= 5 || requests >= 120)
            return rejected(429, "Sponsorship request limit reached");
          active++;
          requests++;
          let forwarded = false;
          return yield* Effect.gen(function* () {
            const session = yield* auth.session(
              request.cookies[authCookies(authConfig.secureCookies).session],
            );
            const { name = "" } = yield* HttpRouter.params;
            const input = yield* readAuthBody(request).pipe(
              Effect.flatMap(
                Schema.decodeUnknownEffect(Schema.fromJsonString(SponsorshipRpcRequest)),
              ),
            );
            yield* validateSponsorshipRequest(input, name, session.address).pipe(
              Effect.provideService(VerificationClient, sdk),
            );
            // The caller cannot choose a cheaper or unrestricted policy.
            const params = input.method.startsWith("pm_")
              ? [...input.params.slice(0, 3), { sponsorshipPolicyId: config.sponsorshipPolicy }]
              : input.params;
            forwarded = true;
            const response = yield* client
              .execute(
                HttpClientRequest.post(url).pipe(
                  HttpClientRequest.bodyText(
                    JSON.stringify({ ...input, params }),
                    "application/json",
                  ),
                ),
              )
              .pipe(
                Effect.provideService(HttpClient.TracerDisabledWhen, () => true),
                Effect.flatMap((upstream) => upstream.json),
                Effect.provideService(HttpIncomingMessage.MaxBodySize, ByteSize.mebibytes(1)),
                Effect.timeout("30 seconds"),
              );
            // Never relay upstream diagnostic data that might contain the credential-bearing URL.
            if (!response || typeof response !== "object" || !("result" in response))
              return HttpServerResponse.jsonUnsafe(
                {
                  jsonrpc: "2.0",
                  id: input.id,
                  error: {
                    code: -32000,
                    notSubmitted:
                      input.method === "eth_sendUserOperation" &&
                      isDefinitiveRejection(response, input.id),
                    message:
                      "Pimlico rejected the operation. Check your sponsorship policy and account compatibility.",
                  },
                },
                { headers },
              );
            return HttpServerResponse.jsonUnsafe(
              { jsonrpc: "2.0", id: input.id, result: response.result },
              { headers },
            );
          }).pipe(
            Effect.catch((error) =>
              Effect.succeed(
                rejected(
                  Schema.is(Unauthenticated)(error) ? 401 : forwarded ? 502 : 400,
                  Schema.is(Unauthenticated)(error)
                    ? "Sign in with your wallet to sponsor this update."
                    : "Sponsorship unavailable. Check your session, HCA permissions and request.",
                  !forwarded,
                ),
              ),
            ),
            Effect.ensuring(
              Effect.sync(() => {
                active--;
              }),
            ),
          );
        }),
      ),
    );
  }),
).pipe(Layer.provide(RecordVerificationLive));
