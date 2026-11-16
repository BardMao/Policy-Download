import { writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { Script } from 'node:vm';

// Resolve the extensionless TypeScript imports shared with the Vite app.
registerHooks({
  resolve(specifier, context, nextResolve) {
    const imports = ['./extensionGenerator', './pkulawLogic', './zipBuilder'];
    return nextResolve(imports.includes(specifier) ? specifier + '.ts' : specifier, context);
  }
});

const {
  generateManifestJson,
  generateBackgroundJs,
  generateContentJs,
  generatePageHookJs
} = await import('./src/utils/extensionGenerator.ts');

if (process.argv.includes('--test')) {
  await import('./src/utils/pkulawLogic.test.ts');
  await import('./src/utils/downloadEvents.test.mjs');
}

const settings = {
  downloadDir: 'PKULaw_Downloads',
  minDelaySec: 3,
  maxDelaySec: 5
};
const manifestJson = generateManifestJson();
const scripts = {
  'background.js': generateBackgroundJs(settings),
  'content.js': generateContentJs(settings),
  'page_hook.js': generatePageHookJs()
};
const manifest = JSON.parse(manifestJson);
for (const name of [manifest.background.service_worker, ...manifest.content_scripts.flatMap(({ js }) => js)]) {
  if (!Object.hasOwn(scripts, name)) throw new Error('Missing extension script: ' + name);
}
for (const [name, source] of Object.entries(scripts)) {
  new Script(source, { filename: name });
  await writeFile(new URL(name, import.meta.url), source, 'utf8');
}
await writeFile(new URL('manifest.json', import.meta.url), manifestJson, 'utf8');