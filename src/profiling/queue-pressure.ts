export function queuePressure(depth: number, capacity: number, maxUtilization: number, evidenceIds: string[]) {
  if (depth < 0 || capacity <= 0 || maxUtilization < 0 || maxUtilization > 1 || evidenceIds.length === 0) throw new Error("queue_pressure_requires_evidence");
  const utilization = depth / capacity;
  return {
    status: utilization <= maxUtilization ? "QUEUE_PRESSURE_BOUNDED" as const : "QUEUE_INSTABILITY_DETECTED" as const,
    depth,
    capacity,
    utilization,
    maxUtilization,
    evidenceIds: [...evidenceIds]
  };
}
