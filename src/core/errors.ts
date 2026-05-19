export class FailClosedError extends Error {
  readonly code: string;

  constructor(code: string, message = code) {
    super(message);
    this.name = "FailClosedError";
    this.code = code;
  }
}

export function assertNever(value: never): never {
  throw new Error(`unhandled_value:${String(value)}`);
}
