import { Context, Effect, Layer, Redacted, Schema } from "effect";

import {
  hashTextRecordValue,
  oauthAttestationMessage,
  oauthMethod,
  oauthTarget,
} from "@ens-social-verification/protocol";
import { OAuthError } from "@ens-social-verification/protocol/errors";
import { OAuthEnvelope, type VerificationClaim } from "@ens-social-verification/protocol/schema";
import { type Address, type Hex, isAddressEqual, verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { OAuthConfig } from "./config.js";
import { oauthProvider } from "./providers.js";

// Trust is supplied by verifier policy, never learned from the proof's attestor field.
export const verifyOAuthAttestation = Effect.fn("verifyOAuthAttestation")(function* (
  input: unknown,
  proofUri: string,
  trustedAttestor: Address,
) {
  const envelope = yield* Schema.decodeUnknownEffect(OAuthEnvelope)(input).pipe(
    Effect.mapError(
      () => new OAuthError({ code: "INVALID_PROOF", message: "Malformed OAuth attestation." }),
    ),
  );
  const { claim, proof } = envelope;
  const provider = yield* oauthProvider(proof.identity.provider);
  if (
    !isAddressEqual(proof.attestor, trustedAttestor) ||
    claim.method !== oauthMethod ||
    claim.recordKey !== provider.recordKey ||
    proof.identity.issuer !== provider.issuer ||
    claim.target !== oauthTarget(proof.identity, proof.attemptId) ||
    claim.valueHash !== hashTextRecordValue(proof.identity.value)
  )
    return yield* new OAuthError({
      code: "INVALID_PROOF",
      message: "OAuth identity or attestor does not match the claim.",
    });
  const valid = yield* Effect.tryPromise({
    try: () =>
      verifyMessage({
        address: trustedAttestor,
        message: oauthAttestationMessage(claim, proofUri),
        signature: proof.signature,
      }),
    catch: () => new OAuthError({ code: "INVALID_PROOF", message: "Invalid attestor signature." }),
  });
  if (!valid)
    return yield* new OAuthError({ code: "INVALID_PROOF", message: "Invalid attestor signature." });
  return envelope;
});

const make = Effect.gen(function* () {
  const config = yield* OAuthConfig;
  const key = Redacted.value(config.signingKey);
  const account = key ? yield* Effect.try(() => privateKeyToAccount(key as Hex)) : null;
  return {
    address: account?.address ?? null,
    sign: Effect.fn("OAuthAttestor.sign")(function* (claim: VerificationClaim, proofUri: string) {
      if (!account)
        return yield* new OAuthError({
          code: "UNAVAILABLE",
          message: "OAuth attestor is not configured.",
        });
      return yield* Effect.tryPromise({
        try: () => account.signMessage({ message: oauthAttestationMessage(claim, proofUri) }),
        catch: () =>
          new OAuthError({ code: "UNAVAILABLE", message: "Cannot sign OAuth attestation." }),
      });
    }),
  };
});

export class OAuthAttestor extends Context.Service<OAuthAttestor, Effect.Success<typeof make>>()(
  "application/OAuthAttestor",
) {
  static readonly layer = Layer.effect(OAuthAttestor, make);
}
