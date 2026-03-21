import type { SSEEvent } from "../shared/types.js";

export function createSSEStream(): {
  readable: ReadableStream;
  write: (event: SSEEvent) => void;
  close: () => void;
} {
  let controller: ReadableStreamDefaultController;

  const readable = new ReadableStream({
    start(c) {
      controller = c;
    },
  });

  const encoder = new TextEncoder();

  return {
    readable,
    write(event: SSEEvent) {
      const formatted = formatSSEEvent(event);
      controller.enqueue(encoder.encode(formatted));
    },
    close() {
      try {
        controller.close();
      } catch {
        // Already closed
      }
    },
  };
}

export function formatSSEEvent(event: SSEEvent): string {
  return `id: ${event.id}\nevent: ${event.event}\ndata: ${event.data}\n\n`;
}
