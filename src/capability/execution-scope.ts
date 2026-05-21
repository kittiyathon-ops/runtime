export interface ExecutionScope {
  scopeId: string;
  capabilityId: string;
  traceId: string;
  sandboxed: boolean;
  allowedSymbols: readonly string[];
}

export class ExecutionScopeValidator {
  validate(scope: ExecutionScope, symbol: string): void {
    if (scope.traceId.length === 0) throw new Error("trace_id_required");
    if (scope.allowedSymbols.length === 0) throw new Error("execution_scope_empty");
    if (!scope.allowedSymbols.includes(symbol)) throw new Error(`execution_scope_symbol_denied:${symbol}`);
  }
}
