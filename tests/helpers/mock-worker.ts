import { Miniflare } from "miniflare";
import * as path from "node:path";

export async function createTestWorker(): Promise<{
  fetch: (input: string | Request, init?: RequestInit) => Promise<Response>;
  dispose: () => Promise<void>;
}> {
  const mf = new Miniflare({
    modules: true,
    scriptPath: path.resolve("src/server/worker.ts"),
    durableObjects: {
      HARNESS_DO: "HarnessDO",
    },
    compatibilityDate: "2024-09-25",
    compatibilityFlags: ["nodejs_compat"],
    bindings: {
      AUTH_TOKEN: "test-token",
    },
  });

  return {
    fetch: async (input: string | Request, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input.startsWith("http")
            ? input
            : `http://localhost${input}`
          : input.url;
      return mf.dispatchFetch(url, init);
    },
    dispose: () => mf.dispose(),
  };
}
