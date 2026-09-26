import { Context, Effect, Layer, Schema } from "effect";

import { DatabaseError } from "@ens-social-verification/protocol/errors";
import { XPublication } from "@ens-social-verification/protocol/model";
import { eq } from "drizzle-orm";

import { Database } from "../../core/layer.js";
import { transactionOrDatabase } from "../../core/transaction.js";
import { xPublications } from "../../schema/x/publication.js";

const make = Effect.gen(function* () {
  const database = yield* Database;
  return {
    find: Effect.fn("XPublicationRepository.find")(
      function* (id: string) {
        const db = yield* transactionOrDatabase(database);
        const [row] = yield* db.select().from(xPublications).where(eq(xPublications.id, id));
        return row ? yield* Schema.decodeUnknownEffect(XPublication)(row) : null;
      },
      Effect.mapError(() => new DatabaseError()),
    ),
    create: Effect.fn("XPublicationRepository.create")(
      function* (input: XPublication) {
        const db = yield* transactionOrDatabase(database);
        const publication = yield* Schema.decodeUnknownEffect(XPublication)(input);
        yield* db.insert(xPublications).values(publication);
      },
      Effect.mapError(() => new DatabaseError()),
    ),
  };
});

export class XPublicationRepository extends Context.Service<
  XPublicationRepository,
  Effect.Success<typeof make>
>()("database/XPublicationRepository") {
  static readonly layer = Layer.effect(XPublicationRepository, make);
}
