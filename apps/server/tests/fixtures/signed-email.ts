import { generateKeyPairSync } from "node:crypto";

import { dkimSign } from "mailauth/lib/dkim/sign.js";

export function signedEmailFixture() {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    publicKey: keys.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    sign: async (
      input: string,
      options: {
        headerList?: string;
        maxBodyLength?: number;
        signingDomain?: string;
        signTime?: Date;
        expires?: Date;
      } = {},
    ) => {
      // Mailauth 6's declaration disagrees with its documented signatureData/headerList runtime API.
      const settings = {
        headerList: options.headerList ?? "from:to:subject",
        ...(options.signTime ? { signTime: options.signTime } : {}),
        ...(options.expires ? { expires: options.expires } : {}),
        signatureData: [
          {
            signingDomain: options.signingDomain ?? "example.com",
            selector: "test",
            privateKey: keys.privateKey.export({ type: "pkcs8", format: "pem" }),
            ...(options.maxBodyLength !== undefined
              ? { maxBodyLength: options.maxBodyLength }
              : {}),
          },
        ],
      };
      const result = await dkimSign(input, settings as unknown as Parameters<typeof dkimSign>[1]);
      return result.signatures + input;
    },
  };
}
