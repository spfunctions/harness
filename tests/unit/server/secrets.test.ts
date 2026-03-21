import { describe, it, expect } from "vitest";
import { maskSecret } from "../../../src/server/secrets.js";

describe("maskSecret", () => {
  it("masks long secrets showing first 4 and last 4", () => {
    expect(maskSecret("abcdefghijklmnop")).toBe("abcd***mnop");
  });

  it("masks short secrets completely", () => {
    expect(maskSecret("short")).toBe("***");
    expect(maskSecret("12345678")).toBe("***");
  });

  it("handles 9-char boundary", () => {
    expect(maskSecret("123456789")).toBe("1234***6789");
  });

  it("handles empty string", () => {
    expect(maskSecret("")).toBe("***");
  });
});
