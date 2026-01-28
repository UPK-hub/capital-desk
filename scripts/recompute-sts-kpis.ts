import { recomputeStsKpisAllTenants } from "@/lib/sts/kpi-recompute";

recomputeStsKpisAllTenants()
  .then(() => {
    console.log("STS KPI recompute finished.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("STS KPI recompute failed:", error);
    process.exit(1);
  });
