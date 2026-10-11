// Bundles src/main.js into a classic (non-module) script so the game also works from file://
import { build, context } from 'esbuild';

const opts = {
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  outfile: 'dist/game.js',
  sourcemap: true,
  minify: !process.argv.includes('--dev'),
  logLevel: 'info',
};

if (process.argv.includes('--watch')) {
  const ctx = await context(opts);
  await ctx.watch();
  console.log('watching…');
} else {
  await build(opts);
}
