import { Context, Effect, Layer, Schema } from "effect";

import { DatabaseError } from "@ens-social-verification/protocol/errors";
import { GithubPublication } from "@ens-social-verification/protocol/model";
import { eq } from "drizzle-orm";

import { Database } from "../../core/layer.js";
import { transactionOrDatabase } from "../../core/transaction.js";
import { githubPublications } from "../../schema/github/publication.js";

const make = Effect.gen(function* () {
  const database = yield* Database;
  return {
    find: Effect.fn("GithubPublicationRepository.find")(
      function* (id: string) {
        const db = yield* transactionOrDatabase(database);
        const [row] = yield* db
          .select()
          .from(githubPublications)
          .where(eq(githubPublications.id, id));
        return row ? yield* Schema.decodeUnknownEffect(GithubPublication)(row) : null;
      },
      Effect.mapError(() => new DatabaseError()),
    ),
    create: Effect.fn("GithubPublicationRepository.create")(
      function* (input: GithubPublication) {
        const db = yield* transactionOrDatabase(database);
        const publication = yield* Schema.decodeUnknownEffect(GithubPublication)(input);
        yield* db.insert(githubPublications).values(publication);
      },
      Effect.mapError(() => new DatabaseError()),
    ),
  };
});

export class GithubPublicationRepository extends Context.Service<
  GithubPublicationRepository,
  Effect.Success<typeof make>
>()("database/GithubPublicationRepository") {
  static readonly layer = Layer.effect(GithubPublicationRepository, make);
}
