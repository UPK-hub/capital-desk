import { loadNovedadCatalog } from "./src/lib/novedad-catalog";
(async () => {
  const items = await loadNovedadCatalog();
  const byEq: Record<string, {code:string;novelty:string}[]> = {};
  for (const it of items) (byEq[it.affectedEquipment] ||= []).push({ code: it.code, novelty: it.novelty });
  console.log("TOTAL fallas:", items.length, "| equipos:", Object.keys(byEq).length);
  for (const [eq, arr] of Object.entries(byEq)) {
    console.log(`\n${eq} (${arr.length}):`);
    arr.slice(0,3).forEach(x => console.log(`   ${x.code} - ${x.novelty}`));
    if (arr.length>3) console.log(`   ...(+${arr.length-3} más)`);
  }
})();
