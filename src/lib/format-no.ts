export function fmtSeq(prefix: string, n: number | null | undefined, width = 3) {
  if (!n || n <= 0) return `${prefix}-???`;
  return `${prefix}-${String(n).padStart(width, "0")}`;
}

export function fmtCaseNo(caseNo: number | null | undefined) {
  return fmtSeq("CASO", caseNo, 3);
}

export function fmtWorkOrderNo(workOrderNo: number | null | undefined) {
  return fmtSeq("OT", workOrderNo, 3);
}
