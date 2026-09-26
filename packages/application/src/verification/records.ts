import { Effect } from "effect";

import {
  getVerificationRecordKey,
  normalizeVerificationName,
} from "@ens-social-verification/protocol";
import { VerificationError } from "@ens-social-verification/protocol/errors";

import { VerificationClient } from "./client.js";
import { assertVerificationSnapshot, type VerificationSnapshot } from "./snapshot.js";

export const readVerificationRecords = Effect.fn("readVerificationRecords")(function* (
  input: string,
  recordKey: string,
  snapshot: VerificationSnapshot,
) {
  const name = yield* normalizeVerificationName(input);
  const descriptorKey = yield* getVerificationRecordKey(recordKey);
  const sdk = yield* VerificationClient;
  const records = yield* sdk.records.getTexts
    .effect({
      name,
      keys: [recordKey, descriptorKey],
      blockNumber: snapshot.number,
    })
    .pipe(
      Effect.mapError(
        () =>
          new VerificationError({
            code: "DEPENDENCY_UNAVAILABLE",
            message: "Cannot read verification records",
          }),
      ),
    );
  yield* assertVerificationSnapshot(snapshot);
  const value = records.find((record) => record.key === recordKey)?.value;
  const descriptor = records.find((record) => record.key === descriptorKey)?.value;
  if (!value || !descriptor) {
    return yield* new VerificationError({
      code: "RECORD_MISMATCH",
      message: "Missing text record or verification descriptor",
    });
  }
  return { name, recordKey, value, descriptor };
});
