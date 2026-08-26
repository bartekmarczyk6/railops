import { resolve } from "node:path";

import { buildKnowledgeIndex } from "../lib/knowledge/indexer.ts";

async function main(): Promise<void> {
  const sourceDir = resolve(process.cwd(), "knowledge");
  const outputFile = resolve(process.cwd(), "knowledge", "index.json");
  await buildKnowledgeIndex(sourceDir, outputFile);
  console.log(`knowledge:index wrote ${outputFile}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
