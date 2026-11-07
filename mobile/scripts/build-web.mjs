import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import sharp from 'sharp';
import { nativeHtml, replaceOnce } from './native-html.mjs';

const mobile = fileURLToPath(new URL('../', import.meta.url));
const source = path.resolve(process.env.SOURCE_DIR || path.join(mobile, '..'));
const catalog = JSON.parse(await readFile(path.join(mobile, 'apps.json'), 'utf8'));
const app = catalog.apps.find(a => a.key === (process.env.APP_KEY || 'zedmall'));
if (!app || app.buildLane !== 'physical-shopping') throw new Error('This build lane is for reviewed physical-shopping clients only');
const out = path.join(mobile, 'www');
await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, 'vendor'), { recursive: true });
await mkdir(path.join(mobile, '.generated'), { recursive: true });

// Copy public client assets only. Exclude backends, admin surfaces, credentials,
// source control, tests, store marketing screenshots and tooling directories.
const rootFiles = await readdir(source, { withFileTypes: true });
for (const entry of rootFiles) {
  if (!entry.isFile() || /^(admin|promoter|store-|sw\.)/i.test(entry.name)) continue;
  if (!/\.(html|css|js|png|svg|webp|jpg|jpeg|woff2?)$/i.test(entry.name) &&
      !['manifest.json', 'catalog.json'].includes(entry.name)) continue;
  await cp(path.join(source, entry.name), path.join(out, entry.name));
}
if (rootFiles.some(e => e.name === 'assets' && e.isDirectory())) {
  await cp(path.join(source, 'assets'), path.join(out, 'assets'), { recursive: true });
}
let html = nativeHtml(await readFile(path.join(source, 'index.html'), 'utf8'));
const twMatch = html.match(/<script>\s*(tailwind\.config\s*=[\s\S]*?)<\/script>/);
if (!twMatch) throw new Error('Missing Tailwind theme');
const context = { tailwind: {} };
vm.runInNewContext(twMatch[1], context, { timeout: 1000 });
const theme = JSON.parse(JSON.stringify(context.tailwind.config));
theme.content = [path.join(source, '*.html'), path.join(source, '*.js')];
const css = await postcss([tailwindcss(theme)]).process('@tailwind base;\n@tailwind components;\n@tailwind utilities;', { from: undefined });
await writeFile(path.join(out, 'vendor/tailwind.css'), css.css);
html = html.replace(twMatch[0], '');
html = replaceOnce(html, '<script src="https://cdn.tailwindcss.com"></script>', '<link rel="stylesheet" href="vendor/tailwind.css">');
for (const dir of ['css', 'webfonts']) {
  await cp(path.join(mobile, 'node_modules/@fortawesome/fontawesome-free', dir), path.join(out, 'vendor/fontawesome', dir), { recursive: true });
}
html = replaceOnce(html, 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css', 'vendor/fontawesome/css/all.min.css');
const appTag = '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>';
const firestoreTag = '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>';
html = replaceOnce(html, appTag, '<script src="vendor/firebase.js"></script>');
html = replaceOnce(html, firestoreTag, '');
await build({ stdin: { contents: "import firebase from 'firebase/compat/app'; import 'firebase/compat/firestore'; window.firebase = firebase;", resolveDir: mobile }, bundle: true, format: 'iife', target: ['es2020'], minify: true, outfile: path.join(out, 'vendor/firebase.js') });
if (/<script[^>]+src=["']https?:/i.test(html)) throw new Error('Unbundled remote executable script remains');
await writeFile(path.join(out, 'index.html'), html);
await writeFile(path.join(mobile, 'capacitor.config.json'), JSON.stringify({ appId: app.bundleId, appName: app.name, webDir: 'www', backgroundColor: '#ffffff', ios: { contentInset: 'automatic', preferredContentMode: 'mobile' } }, null, 2) + '\n');
const icon = await sharp(path.join(source, 'icon-512.png')).resize(1024, 1024).flatten({ background: '#ffffff' }).removeAlpha().png().toBuffer();
await writeFile(path.join(mobile, '.generated/AppIcon-512@2x.png'), icon);
const splashIcon = await sharp(icon).resize(512, 512).png().toBuffer();
await sharp({ create: { width: 2732, height: 2732, channels: 3, background: '#ffffff' } }).composite([{ input: splashIcon, gravity: 'centre' }]).png().toFile(path.join(mobile, '.generated/splash.png'));
await writeFile(path.join(mobile, '.generated/build-manifest.json'), JSON.stringify({ app: app.key, bundleId: app.bundleId, sourceCommit: app.sourceCommit, version: '1.0', status: 'unsigned-development-build', reviewReady: false }, null, 2) + '\n');
console.log(`Bundled ${app.name}: native assets, local SDK/CSS, payment confirmation required. Not submitted to Apple.`);
