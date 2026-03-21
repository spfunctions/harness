import type { HarnessErrorCode } from "./types.js";

export class HarnessError extends Error {
  readonly code: HarnessErrorCode;

  constructor(code: HarnessErrorCode, message: string) {
    super(message);
    this.name = "HarnessError";
    this.code = code;
  }
}
