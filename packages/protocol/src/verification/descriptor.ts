import { Effect, Schema } from "effect";

import { VerificationError } from "../errors/verification.js";
import { VerificationDescriptor, VerificationRecordKey } from "../schema/verification.js";

export const parseVerificationDescriptor = Effect.fn("parseVerificationDescriptor")(function* (
  value: string,
) {
  if (value.length > 2048 || !/^[\x21-\x7e]+(?: [\x21-\x7e]+)*$/.test(value)) {
    return yield* new VerificationError({
      code: "INVALID_DESCRIPTOR",
      message: "Descriptor must use single spaces and at most 2048 ASCII bytes",
    });
  }
  const [prefix, ...tokens] = value.split(" ");
  if (prefix !== "ensrv1") {
    return yield* new VerificationError({
      code: "INVALID_DESCRIPTOR",
      message: "Unsupported descriptor format",
    });
  }
  const fields = new Map<string, string>();
  for (const token of tokens) {
    const separator = token.indexOf("=");
    const key = token.slice(0, separator);
    const field = token.slice(separator + 1);
    if (separator < 1 || !["a", "m", "u"].includes(key) || !field || fields.has(key)) {
      return yield* new VerificationError({
        code: "INVALID_DESCRIPTOR",
        message: "Missing, duplicate, or unknown descriptor field",
      });
    }
    fields.set(key, field);
  }
  const authorityVersion = fields.get("a") ?? "";
  if (
    !fields.has("a") ||
    !fields.has("m") ||
    !/^[1-9][0-9]{0,9}$/.test(authorityVersion) ||
    BigInt(authorityVersion) > 4294967295n
  ) {
    return yield* new VerificationError({
      code: "INVALID_DESCRIPTOR",
      message: "Invalid authority or missing method",
    });
  }
  if (fields.get("a") !== "2") {
    return yield* new VerificationError({
      code: "UNSUPPORTED_AUTHORITY",
      message: "Only experimental ENSv2 authority 2 is supported",
    });
  }
  const proofUri = fields.get("u");
  if (proofUri !== undefined) {
    const uri = yield* Effect.try({
      try: () => new URL(proofUri),
      catch: () =>
        new VerificationError({ code: "INVALID_DESCRIPTOR", message: "Invalid proof URI" }),
    });
    if (
      proofUri.length > 1024 ||
      !proofUri.startsWith("https://") ||
      /[\\#]/.test(proofUri) ||
      /%(?![0-9a-fA-F]{2})/.test(proofUri) ||
      uri.username ||
      uri.password ||
      !uri.hostname
    ) {
      return yield* new VerificationError({
        code: "INVALID_DESCRIPTOR",
        message: "Proof URI must be HTTPS without credentials or fragment",
      });
    }
  }
  return yield* Schema.decodeUnknownEffect(VerificationDescriptor)({
    authorityVersion: 2,
    method: fields.get("m"),
    ...(proofUri === undefined ? {} : { proofUri }),
  }).pipe(
    Effect.mapError(
      () =>
        new VerificationError({
          code: "INVALID_DESCRIPTOR",
          message: "Invalid verification method",
        }),
    ),
  );
});

export const formatVerificationDescriptor = Effect.fn("formatVerificationDescriptor")(function* (
  descriptor: VerificationDescriptor,
) {
  const value = `ensrv1 a=${descriptor.authorityVersion} m=${descriptor.method}${descriptor.proofUri === undefined ? "" : ` u=${descriptor.proofUri}`}`;
  yield* parseVerificationDescriptor(value);
  return value;
});

export const getVerificationRecordKey = Effect.fn("getVerificationRecordKey")(function* (
  key: string,
) {
  yield* Schema.decodeUnknownEffect(VerificationRecordKey)(key).pipe(
    Effect.mapError(
      () =>
        new VerificationError({ code: "INVALID_DESCRIPTOR", message: "Invalid text record key" }),
    ),
  );
  return `verification[text][${key}]`;
});

export const validateDescriptorMethod = Effect.fn("validateDescriptorMethod")(function* (
  descriptor: VerificationDescriptor,
  method: string,
  uriPolicy: "required" | "forbidden",
) {
  if (descriptor.method !== method) {
    return yield* new VerificationError({
      code: "UNSUPPORTED_METHOD",
      message: "No verifier for this exact method",
    });
  }
  if ((uriPolicy === "required") !== (descriptor.proofUri !== undefined)) {
    return yield* new VerificationError({
      code: "INVALID_DESCRIPTOR",
      message: "Proof URI violates method policy",
    });
  }
});
