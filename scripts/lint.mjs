import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
const forbiddenPatterns = [
  { pattern: /\bconsole\./, message: "console statements are not allowed" },
  { pattern: /\bany\b/, message: "explicit any is not allowed" },
  { pattern: /\bTODO\b/, message: "TODO markers are not allowed" }
];

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listSourceFiles(path) : [path];
  }));

  return files.flat().filter((file) => /\.(ts|tsx)$/.test(file) && !file.endsWith(".test.tsx"));
}

const files = await listSourceFiles(sourceDirectory);
const failures = [];

for (const file of files) {
  const content = await readFile(file, "utf8");
  for (const { pattern, message } of forbiddenPatterns) {
    if (pattern.test(content)) failures.push(`${file}: ${message}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}
