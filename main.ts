// Skylark Valley — the entry's hand-in program (Node 22, standard library only).
// The game is plain static files under game/ (game/index.html and its ES modules,
// no library, no network request) and the screenshots are real renders of it in
// a browser. This program copies both into /output and writes /output/dossier.json,
// the summary the judge reads, with the vendored make.fun library.
//
// Play it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function handIn() {
  mkdirSync(outDir, { recursive: true });
  cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
  const shotsOut = join(outDir, 'screenshots');
  mkdirSync(shotsOut, { recursive: true });
  const shotsIn = join(repoRoot, 'screenshots');
  if (existsSync(shotsIn)) cpSync(shotsIn, shotsOut, { recursive: true });

  // The gate's own caps, as the kit states them: at most 4 screenshots, each at
  // most 256 KiB; game/ at most 993 files and 48 MiB; a path under game/ at most
  // 1,000 bytes; the dossier's text at most 160 KiB. The scorer refuses an
  // entry past any of them, so fail loudly here instead of handing one in.
  const shots = existsSync(shotsIn) ? readdirSync(shotsIn) : [];
  if (shots.length < 3 || shots.length > 4) {
    throw new Error(`expected 3 or 4 screenshots, found ${shots.length}`);
  }
  writeFileSync(
    join(outDir, 'dossier.json'),
    buildDossier(outDir, {
      text_max_bytes: 163840,
      screenshots: { max: 4, max_bytes: 262144 },
      game_max_files: 993,
      game_max_bytes: 50331648,
      game_path_max_bytes: 1000,
    }),
  );
}

handIn();
