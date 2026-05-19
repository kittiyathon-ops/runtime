declare module "ws" {
  export default class WebSocket {
    static readonly OPEN: number;
    readonly readyState: number;
    on(event: "open" | "close" | "error" | "message", listener: (...args: unknown[]) => void): this;
    send(data: string): void;
    close(): void;
    constructor(url: string);
  }
}
