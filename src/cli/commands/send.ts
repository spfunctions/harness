import { loadConfig, getDaemonPid } from "../config.js";
import * as output from "../output.js";
import { encode } from "../../protocol/codec.js";
import {
  createCapabilityRequest,
  createCapabilityReady,
  createNegotiate,
  createDataMessage,
  validateChannel,
} from "../../protocol/messages.js";
import type { Message } from "../../shared/types.js";

export async function sendCommand(
  type: string,
  content: string,
  options: { ref?: string; channel?: string },
): Promise<void> {
  const config = loadConfig();
  const pid = getDaemonPid();

  if (!pid) {
    output.error(
      "Daemon not running. Start it with: sparkco daemon start",
    );
    return;
  }

  let message: Message;

  switch (type) {
    case "capability-request":
      message = createCapabilityRequest("client", content);
      break;
    case "capability-ready":
      if (!options.ref) {
        output.error("--ref is required for capability-ready");
        return;
      }
      message = createCapabilityReady("client", options.ref, content);
      break;
    case "negotiate":
      if (!options.ref) {
        output.error("--ref is required for negotiate");
        return;
      }
      message = createNegotiate("client", options.ref, content);
      break;
    case "data":
      if (!options.channel) {
        output.error("--channel is required for data messages");
        return;
      }
      try {
        validateChannel(options.channel);
      } catch (e) {
        output.error(
          `Channel name invalid: ${e instanceof Error ? e.message : String(e)}`,
        );
        return;
      }
      {
        let payload: unknown;
        try {
          payload = JSON.parse(content);
        } catch {
          payload = content;
        }
        message = createDataMessage("client", options.channel, payload);
      }
      break;
    default:
      output.error(
        `Unknown message type: ${type}. Use: capability-request, capability-ready, negotiate, data`,
      );
      return;
  }

  // Send via REST to server
  try {
    const res = await fetch(`${config.server.workerUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.session.token}`,
      },
      body: encode(message),
    });
    if (!res.ok) {
      output.error(`Server returned ${res.status}`);
      return;
    }
    output.success(`Sent ${type} (id: ${message.id})`);
  } catch (err) {
    output.error(
      `Failed to send: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
