import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
await build({
  entryPoints: ['src/lib/movisLibraries.js'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'tests/.artifacts/libraries.mjs',
  logLevel: 'silent'
});
const {
  loadMovisLibraries
} = await import('./.artifacts/libraries.mjs');
const result = await loadMovisLibraries(AbortSignal.timeout(60000));
// Log only counts and states, never customer/order contents.
console.log(JSON.stringify(result.dataState, null, 2));
writeFileSync('tests/.artifacts/library-audit.json', JSON.stringify(result.dataState, null, 2));
