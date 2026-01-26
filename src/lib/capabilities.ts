export const CAPABILITIES = {
  STS_READ: "STS_READ",
  STS_WRITE: "STS_WRITE",
  STS_ADMIN: "STS_ADMIN",
  PLANNER: "PLANNER",
  CASE_ASSIGN: "CASE_ASSIGN",
} as const;

export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];
