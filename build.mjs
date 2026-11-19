import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';

const args = new Set(process.argv.slice(2));
const isWatch = args.has('--watch');
const isTest = args.has('--test');

const DIST_DIR = path.resolve('dist');
const DIST_TEST_DIR = path.resolve('dist-test');

async function buildUiHtml() {
  const [jsResult, cssResult] = await Promise.all([
    esbuild.build({
      entryPoints: ['src/ui.ts'],
      bundle: true,
      write: false,
      minify: !isWatch,
      target: 'es2020',
      format: 'iife',
    }),
    esbuild.build({
      entryPoints: ['src/ui.css'],
      bundle: true,
      write: false,
      minify: !isWatch,
    }),
  ]);

  const bundledJs = jsResult.outputFiles[0].text;
  const bundledCss = cssResult.outputFiles[0].text;
  const htmlTemplate = fs.readFileSync(path.resolve('src/ui.html'), 'utf8');

  if (!htmlTemplate.includes('<!-- INLINE_STYLE -->')) {
    throw new Error('src/ui.html must contain <!-- INLINE_STYLE --> placeholder');
  }
  if (!htmlTemplate.includes('<!-- INLINE_SCRIPT -->')) {
    throw new Error('src/ui.html must contain <!-- INLINE_SCRIPT --> placeholder');
  }

  const finalHtml = htmlTemplate
    .replace('<!-- INLINE_STYLE -->', () => `<style>\n${bundledCss}\n</style>`)
    .replace('<!-- INLINE_SCRIPT -->', () => `<script>\n${bundledJs}\n</script>`);

  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.writeFileSync(path.join(DIST_DIR, 'ui.html'), finalHtml, 'utf8');
}

async function buildAll() {
  fs.mkdirSync(DIST_DIR, { recursive: true });

  await esbuild.build({
    entryPoints: ['src/code.ts'],
    bundle: true,
    outfile: path.join(DIST_DIR, 'code.js'),
    minify: !isWatch,
    target: 'es2017',
    format: 'iife',
  });

  await buildUiHtml();
  console.log('[build] dist/code.js and dist/ui.html built successfully.');
}

async function buildTests() {
  fs.mkdirSync(DIST_TEST_DIR, { recursive: true });
  await esbuild.build({
    entryPoints: ['tests/run.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: path.join(DIST_TEST_DIR, 'tests.cjs'),
    target: 'node18',
  });
  console.log('[build] dist-test/tests.cjs built successfully.');
}

if (isTest) {
  await buildTests();
} else if (isWatch) {
  await buildAll();
  console.log('[watch] Watching src/ for changes...');
  fs.watch(path.resolve('src'), { recursive: true }, async (_event, filename) => {
    if (!filename) return;
    try {
      await buildAll();
    } catch (err) {
      console.error('[watch] Build error:', err);
    }
  });
} else {
  await buildAll();
}
