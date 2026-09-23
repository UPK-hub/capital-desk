/**
 * Borra las previsualizaciones de video en caché (uploads/_previews).
 *
 *   npm run videos:purgar-previews          -> borra las de más de N días
 *   npm run videos:purgar-previews -- todo  -> borra todas
 *
 * Son archivos derivados: si alguien vuelve a abrir el video, se regeneran
 * solos. Sirve para liberar disco sin tocar los videos originales.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { purgeOldPreviews } from "../src/lib/media-transcode";
import { getUploadsRoot } from "../src/lib/uploads";

async function main() {
  const todo = process.argv.slice(2).some((a) => a.toLowerCase() === "todo");
  const dir = path.join(path.resolve(getUploadsRoot()), "_previews");

  if (todo) {
    let removed = 0;
    let bytes = 0;
    try {
      for (const name of await fs.readdir(dir)) {
        const abs = path.join(dir, name);
        try {
          bytes += (await fs.stat(abs)).size;
          await fs.rm(abs, { force: true });
          removed += 1;
        } catch {
          /* noop */
        }
      }
    } catch {
      console.log("No hay carpeta de previsualizaciones todavía.");
      return;
    }
    console.log(`Borradas ${removed} previsualizaciones (${(bytes / 1024 / 1024).toFixed(1)} MB).`);
    return;
  }

  const removed = await purgeOldPreviews(true);
  console.log(`Borradas ${removed} previsualizaciones vencidas.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
