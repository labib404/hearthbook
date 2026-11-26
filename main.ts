// Hearthbook — hand-in program for make.fun's household budget bounty (Node 22, standard library only).
//
// The site itself is the static folder app/: plain HTML, CSS and ES modules with no build step and no network
// requests. This program only packages it: it copies app/ and screenshots/ into the output folder and writes
// dossier.json with the kit's vendored library (vendor/makefun-frontend.ts, kept byte for byte as shipped).
//
// Run locally:   mkdir out; MAKEFUN_OUTPUT_DIR=out node main.ts
// Preview site:  node serve.ts   (then open http://localhost:8080)

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** Copy one folder of the repository into the output folder, if it exists. */
function copyFolder(name: string): void {
  const from = join(repoRoot, name);
  const to = join(outputDir, name);
  mkdirSync(to, { recursive: true });
  if (existsSync(from)) cpSync(from, to, { recursive: true });
}

mkdirSync(outputDir, { recursive: true });
copyFolder('app');
copyFolder('screenshots');

// The gate's own caps: 4 screenshots of at most 256 KiB, 993 entries and 16 MiB under app/, a 160 KiB text.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
