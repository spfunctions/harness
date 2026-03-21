import { MockSSEServer } from "../tests/helpers/mock-sse-server.js";
import { Daemon } from "../src/client/daemon.js";

async function main() {
  // Start mock server
  const mockServer = new MockSSEServer(8787);
  const { url } = await mockServer.start();
  console.log(`Mock server running at ${url}`);

  // Start daemon
  const daemon = new Daemon({
    serverUrl: url,
    token: "dev-token",
    workDir: `${process.env.HOME}/.sparkco`,
    localPort: 3456,
  });

  await daemon.start();
  console.log("Daemon started");
  console.log("State:", daemon.getState());

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    await daemon.stop();
    await mockServer.stop();
    process.exit(0);
  });
}

main().catch(console.error);
