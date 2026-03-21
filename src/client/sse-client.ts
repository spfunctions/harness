import { EventSource } from "eventsource";
import type { Message } from "../shared/types.js";
import { decode } from "../protocol/codec.js";

export type SSEClientConfig = {
  url: string;
  token: string;
  onMessage: (msg: Message) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  reconnectInterval?: number;
  maxReconnectInterval?: number;
};

export class SSEClient {
  private config: SSEClientConfig;
  private es: EventSource | null = null;
  private connected = false;
  private lastEventId: string | null = null;
  private reconnectMs: number;
  private baseReconnectMs: number;
  private maxReconnectMs: number;
  private intentionalClose = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: SSEClientConfig) {
    this.config = config;
    this.baseReconnectMs = config.reconnectInterval ?? 3000;
    this.reconnectMs = this.baseReconnectMs;
    this.maxReconnectMs = config.maxReconnectInterval ?? 30000;
  }

  connect(): void {
    this.intentionalClose = false;
    this.doConnect();
  }

  private doConnect(): void {
    const url = new URL(this.config.url);
    if (this.lastEventId) {
      url.searchParams.set("lastEventId", this.lastEventId);
    }

    this.es = new EventSource(url.toString(), {
      fetch: (input, init) => {
        return fetch(input, {
          ...init,
          headers: {
            ...Object.fromEntries(
              (init?.headers as Headers)?.entries?.() ?? [],
            ),
            Authorization: `Bearer ${this.config.token}`,
            ...(this.lastEventId
              ? { "Last-Event-ID": this.lastEventId }
              : {}),
          },
        });
      },
    });

    this.es.onopen = () => {
      this.connected = true;
      this.reconnectMs = this.baseReconnectMs;
      this.config.onConnect();
    };

    this.es.onerror = () => {
      if (this.connected) {
        this.connected = false;
        this.config.onDisconnect();
      }
      this.cleanup();
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    };

    // Listen for all event types
    const eventTypes = [
      "capability-request",
      "capability-ready",
      "data",
      "state-sync",
      "negotiate",
    ];

    for (const eventType of eventTypes) {
      this.es.addEventListener(eventType, (event: MessageEvent) => {
        this.lastEventId = event.lastEventId || this.lastEventId;
        try {
          const msg = decode(event.data);
          this.config.onMessage(msg);
        } catch {
          console.warn(`Failed to decode SSE message: ${event.data}`);
        }
      });
    }
  }

  private cleanup(): void {
    if (this.es) {
      this.es.close();
      this.es = null;
    }
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, this.reconnectMs);

    // Exponential backoff
    this.reconnectMs = Math.min(
      this.reconnectMs * 2,
      this.maxReconnectMs,
    );
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.connected) {
      this.connected = false;
      this.config.onDisconnect();
    }
    this.cleanup();
  }

  isConnected(): boolean {
    return this.connected;
  }

  getLastEventId(): string | null {
    return this.lastEventId;
  }
}
