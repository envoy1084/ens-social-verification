import { Context, Effect, Layer, Option } from "effect";
import { SqlError } from "effect/unstable/sql";

import { DatabaseError } from "@ens-social-verification/protocol/errors";

import { Database } from "./layer.js";

type DatabaseService = typeof Database.Service;
type Transaction = Parameters<Parameters<DatabaseService["transaction"]>[0]>[0];

class TransactionClient extends Context.Service<TransactionClient, Transaction>()(
  "database/TransactionClient",
) {}

export const transactionOrDatabase = Effect.fnUntraced(function* (database: DatabaseService) {
  const current = yield* Effect.serviceOption(TransactionClient);

  return Option.isSome(current) ? current.value : database;
});

export interface TransactionServiceShape {
  readonly run: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E | DatabaseError, R>;
}

export class TransactionService extends Context.Service<
  TransactionService,
  TransactionServiceShape
>()("database/TransactionService") {
  static readonly layer = Layer.effect(
    TransactionService,
    Effect.gen(function* () {
      const database = yield* Database;

      return TransactionService.of({
        run: (effect) =>
          Effect.gen(function* () {
            const current = yield* Effect.serviceOption(TransactionClient);
            if (Option.isSome(current)) return yield* effect;

            return yield* database
              .transaction((tx) => effect.pipe(Effect.provideService(TransactionClient, tx)))
              .pipe(
                Effect.mapError((error) =>
                  SqlError.isSqlError(error) ? new DatabaseError() : error,
                ),
              );
          }),
      });
    }),
  );
}
