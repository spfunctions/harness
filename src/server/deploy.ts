export type DeployResult = {
  success: boolean;
  url?: string;
  error?: string;
};

// Phase 0: stub — returns mock result
// Phase 1: will use execa to call wrangler deploy
export async function deployWorker(
  _entryPath: string,
  _name: string,
): Promise<DeployResult> {
  return {
    success: true,
    url: "https://sparkco-harness.workers.dev",
  };
}
