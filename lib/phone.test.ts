import { describe, it, expect } from "vitest";
import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("strips formatting characters, keeping only digits", () => {
    expect(normalizePhone("(11) 99999-9999")).toBe("11999999999");
  });

  it("keeps a leading country code", () => {
    expect(normalizePhone("+55 11 99999-9999")).toBe("5511999999999");
  });

  it("is idempotent on an already-normalized number", () => {
    expect(normalizePhone("11999999999")).toBe("11999999999");
  });
});
