import { vi } from "vitest";

// Mock wrangler CLI responses for testing deploy/secrets logic

export function mockWranglerDeploy(opts?: {
  success?: boolean;
  url?: string;
  error?: string;
}): void {
  const success = opts?.success ?? true;
  const url = opts?.url ?? "https://sparkco-harness.test.workers.dev";

  vi.mock("execa", async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return {
      ...actual,
      execa: vi.fn(async (cmd: string, args: string[]) => {
        if (cmd === "wrangler" && args[0] === "deploy") {
          if (!success) {
            throw new Error(opts?.error ?? "deploy failed");
          }
          return {
            stdout: `Uploaded sparkco-harness\nPublished sparkco-harness\n${url}`,
            stderr: "",
            exitCode: 0,
          };
        }
        if (cmd === "wrangler" && args[0] === "delete") {
          return { stdout: "Deleted", stderr: "", exitCode: 0 };
        }
        // Pass through to actual execa for non-wrangler commands
        const { execa: realExeca } = actual as { execa: typeof import("execa").execa };
        return realExeca(cmd, args);
      }),
    };
  });
}

export function mockWranglerSecret(
  _action: "put" | "delete" | "list",
): void {
  // Secrets are managed via CF API, not wrangler CLI
  // This mock is a placeholder for future wrangler secret commands
}

export function resetWranglerMock(): void {
  vi.restoreAllMocks();
}
