import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkEnvironment } from "../../../src/cli/wizard/validate.js";
import { maskSecret } from "../../../src/server/secrets.js";

describe("checkEnvironment", () => {
  it("returns checks for git, node, wrangler, pi", async () => {
    const checks = await checkEnvironment();
    expect(checks.length).toBe(4);
    const names = checks.map((c) => c.name);
    expect(names).toContain("git");
    expect(names).toContain("node");
    expect(names).toContain("wrangler");
    expect(names).toContain("pi");
  });

  it("node check returns ok for current version (>=18)", async () => {
    const checks = await checkEnvironment();
    const nodeCheck = checks.find((c) => c.name === "node")!;
    expect(nodeCheck.status).toBe("ok");
    expect(nodeCheck.required).toBe(true);
  });

  it("git check returns ok when git is installed", async () => {
    const checks = await checkEnvironment();
    const gitCheck = checks.find((c) => c.name === "git")!;
    expect(gitCheck.status).toBe("ok");
    expect(gitCheck.required).toBe(true);
    expect(gitCheck.version).toBeTruthy();
  });

  it("pi is optional (required=false)", async () => {
    const checks = await checkEnvironment();
    const piCheck = checks.find((c) => c.name === "pi")!;
    expect(piCheck.required).toBe(false);
  });

  it("missing tools have installHint", async () => {
    const checks = await checkEnvironment();
    const piCheck = checks.find((c) => c.name === "pi")!;
    if (piCheck.status === "missing") {
      expect(piCheck.installHint).toBeTruthy();
    }
  });
});

describe("maskSecret", () => {
  it("masks middle of long values", () => {
    expect(maskSecret("sk-abcdef1234567890")).toBe("sk-a***7890");
  });

  it("masks short values completely", () => {
    expect(maskSecret("short")).toBe("***");
  });

  it("masks 8-char boundary", () => {
    expect(maskSecret("12345678")).toBe("***");
  });

  it("masks 9-char values", () => {
    expect(maskSecret("123456789")).toBe("1234***6789");
  });
});
