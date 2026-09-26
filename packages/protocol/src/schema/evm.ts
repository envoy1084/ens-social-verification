import { Schema } from "effect";

export const Hex = Schema.TemplateLiteral(["0x", Schema.String]).check(
  Schema.isPattern(/^0x[0-9a-fA-F]*$/),
);
export const EthereumAddress = Hex.check(Schema.isPattern(/^0x[a-fA-F0-9]{40}$/)).annotate({
  identifier: "EthereumAddress",
});
export const SepoliaChainId = Schema.Literal(11155111);

export type EthereumAddress = typeof EthereumAddress.Type;
