#!/usr/bin/env node
/**
 * Fail the build if common secret patterns appear in dist/ (static bundle leak check).
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const BAD = [/sk-[A-Za-z0-9_-]{10,}/, /DEEPSEEK_API_KEY/, /OPENAI_API_KEY/];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const dist = join(process.cwd(), "dist");
let files;
try {
  files = await walk(dist);
} catch {
  console.error("check-dist-leaks: dist/ not found — run npm run build first");
  process.exit(1);
}

let leaked = false;
for (const f of files) {
  if (!/\.(js|css|html|json|map)$/i.test(f)) continue;
  const text = await readFile(f, "utf8");
  for (const pat of BAD) {
    if (pat.test(text)) {
      console.error(`Leak pattern ${pat} matched in ${f}`);
      leaked = true;
    }
  }
}

if (leaked) process.exit(1);
console.log("check-dist-leaks: OK (no secret patterns in dist/)");
