import { describe, expect, it } from "vitest";

import { isDefinitiveRejection } from "../../src/routes/sponsorship/rejection.js";

describe("bundler submission rejection", () => {
  it("recognizes correlated validation rejections without exposing upstream diagnostics", () => {
    for (const code of [-32602, -32500, -32501, -32502, -32503, -32504, -32505, -32507, -32508])
      expect(isDefinitiveRejection({ id: 1, error: { code } }, 1)).toBe(true);
  });

  it("keeps unknown, malformed, mismatched and accepted outcomes unresolved", () => {
    for (const response of [
      null,
      {},
      { id: 1, error: { code: -32603 } },
      { id: 1, error: { code: -32000 } },
      { id: 2, error: { code: -32500 } },
      { id: 1, error: { code: "-32500" } },
      { id: 1, result: "0x", error: { code: -32500 } },
    ])
      expect(isDefinitiveRejection(response, 1)).toBe(false);
  });
});
