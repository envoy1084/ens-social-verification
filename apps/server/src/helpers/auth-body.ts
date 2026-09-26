import { ByteSize, Effect, Schema, Stream } from "effect";
import { HttpIncomingMessage, type HttpServerRequest } from "effect/unstable/http";

export class AuthHttpError extends Schema.TaggedError<AuthHttpError>()("AuthHttpError", {
  status: Schema.Number,
  message: Schema.String,
}) {}

export const readAuthBody = Effect.fn("readAuthBody")(function* (
  request: HttpServerRequest.HttpServerRequest,
) {
  if (request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    return yield* new AuthHttpError({ status: 415, message: "Expected application/json" });
  }
  return yield* request.stream.pipe(
    Stream.runFoldEffect(
      () => ({ chunks: [] as Uint8Array[], bytes: 0 }),
      (state, chunk) => {
        const bytes = state.bytes + chunk.byteLength;
        if (bytes > 16 * 1024)
          return Effect.fail(new AuthHttpError({ status: 413, message: "Request body too large" }));
        state.chunks.push(chunk);
        return Effect.succeed({ chunks: state.chunks, bytes });
      },
    ),
    Effect.map(({ chunks }) => Buffer.concat(chunks).toString("utf8")),
    Effect.provideService(HttpIncomingMessage.MaxBodySize, ByteSize.kibibytes(16)),
    Effect.timeout("5 seconds"),
    Effect.mapError(
      () => new AuthHttpError({ status: 413, message: "Request body unavailable or too large" }),
    ),
  );
});
