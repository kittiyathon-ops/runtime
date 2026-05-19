declare module "better-sqlite3" {
  export interface Statement {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  export interface Database {
    exec(sql: string): void;
    prepare(sql: string): Statement;
    close(): void;
  }

  export default function Database(path: string): Database;
}
