import { nanoid } from "nanoid";
import type { Issue, StressResult } from "../shared/types.js";
import { encode } from "../protocol/codec.js";
import { createDataMessage, createStateSync } from "../protocol/messages.js";

export interface StressScenario {
  id: string;
  name: string;
  description: string;
  run: (serverUrl: string, token: string) => Promise<StressResult>;
}

export const STRESS_SCENARIOS: StressScenario[] = [
  {
    id: "stress-rapid-messages",
    name: "Rapid message burst",
    description: "Send 50 data messages in quick succession",
    run: async (serverUrl, token) => {
      const start = Date.now();
      let sent = 0;
      let errors: string[] = [];

      const promises = Array.from({ length: 50 }, (_, i) => {
        const msg = createDataMessage("client", "stress/rapid", { seq: i });
        return fetch(`${serverUrl}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: encode(msg),
        }).then((res) => {
          if (res.ok) sent++;
          else errors.push(`Message ${i}: HTTP ${res.status}`);
        }).catch((err) => {
          errors.push(`Message ${i}: ${(err as Error).message}`);
        });
      });

      await Promise.all(promises);
      const latency = Date.now() - start;

      return {
        scenario_id: "stress-rapid-messages",
        passed: sent >= 45, // Allow 10% failure
        metrics: {
          messages_sent: 50,
          messages_received: sent,
          avg_latency_ms: Math.round(latency / 50),
          errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
        },
        is_regression: false,
      };
    },
  },
  {
    id: "stress-large-payload",
    name: "Large payload",
    description: "Send a 100KB JSON payload",
    run: async (serverUrl, token) => {
      const largeData = { data: "x".repeat(100000) };
      const msg = createDataMessage("client", "stress/large", largeData);
      const start = Date.now();

      try {
        const res = await fetch(`${serverUrl}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: encode(msg),
        });
        const latency = Date.now() - start;

        return {
          scenario_id: "stress-large-payload",
          passed: res.ok,
          metrics: {
            messages_sent: 1,
            messages_received: res.ok ? 1 : 0,
            avg_latency_ms: latency,
            errors: res.ok ? undefined : [`HTTP ${res.status}`],
          },
          is_regression: false,
        };
      } catch (err) {
        return {
          scenario_id: "stress-large-payload",
          passed: false,
          metrics: {
            messages_sent: 1,
            messages_received: 0,
            errors: [(err as Error).message],
          },
          is_regression: false,
        };
      }
    },
  },
  {
    id: "stress-health-check",
    name: "Health endpoint under load",
    description: "Hit /health 20 times concurrently",
    run: async (serverUrl, _token) => {
      const start = Date.now();
      let ok = 0;
      const errors: string[] = [];

      const promises = Array.from({ length: 20 }, () =>
        fetch(`${serverUrl}/health`)
          .then((res) => {
            if (res.ok) ok++;
            else errors.push(`HTTP ${res.status}`);
          })
          .catch((err) => errors.push((err as Error).message)),
      );

      await Promise.all(promises);
      const latency = Date.now() - start;

      return {
        scenario_id: "stress-health-check",
        passed: ok >= 18,
        metrics: {
          messages_sent: 20,
          messages_received: ok,
          avg_latency_ms: Math.round(latency / 20),
          errors: errors.length > 0 ? errors.slice(0, 3) : undefined,
        },
        is_regression: false,
      };
    },
  },
];

export function getCurrentScenario(cycleCount: number): StressScenario {
  return STRESS_SCENARIOS[cycleCount % STRESS_SCENARIOS.length];
}

export function stressResultToIssue(result: StressResult, scenario: StressScenario): Issue | null {
  if (result.passed) return null;
  return {
    id: `iss-stress-${nanoid(8)}`,
    type: "perf",
    severity: "high",
    title: `Stress test failed: ${scenario.name}`,
    description: `Scenario: ${scenario.description}\n\nMetrics: ${JSON.stringify(result.metrics, null, 2)}`,
    reproduction: `Run stress scenario: ${scenario.id}`,
    affected_files: ["src/server/worker.ts", "src/server/durable-object.ts"],
    discovered_by: "stress-test",
    discovered_at: Date.now(),
  };
}
