#!/usr/bin/env node

/**
 * JavaScript Build Script - Module Bundling & Minification
 *
 * Concatena i moduli ES6 in un singolo file, poi minifica con la Terser JS API
 * (no child process, no temp file su disco).
 */

import fs from 'fs';
import path from 'path';
import { minify } from 'terser';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ordine di caricamento (per dipendenze)
const modules = [
  'js/config.js',
  'js/modules/polyfills.js',
  'js/modules/observer.js',
  'js/main.js',
];

const OUT_JS  = path.join(__dirname, 'dist/main.min.js');
const OUT_MAP = path.join(__dirname, 'dist/main.min.js.map');

console.log('📦 Bundling JavaScript modules...');

let bundledCode = '';

for (const module of modules) {
  const filePath = path.join(__dirname, module);
  let content = fs.readFileSync(filePath, 'utf-8');

  // Rimuovi BOM se presente
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);

  // Rimuovi import/export ES6
  content = content.replace(/^import\s+.*from\s+['"][^'"]*['"]\s*;?\s*$/gm, '');
  content = content.replace(/^export\s+/gm, '');
  content = content.replace(/\n\n+/g, '\n\n');

  bundledCode += content + '\n\n';
}

console.log(`[OK] Bundled ${modules.length} modules`);

// Minifica con Terser JS API (no child process)
console.log('🔨 Minifying JavaScript...');

const result = await minify(bundledCode, {
  sourceMap: {
    filename: 'main.min.js',
    url:      'main.min.js.map',
  },
});

if (!result.code) {
  console.error('❌ Terser returned empty output');
  process.exit(1);
}

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(OUT_JS,  result.code);
if (result.map) fs.writeFileSync(OUT_MAP, result.map);

console.log('✅ Minified');

const sizeKB = (fs.statSync(OUT_JS).size / 1024).toFixed(2);
console.log(`📊 Final size: ${sizeKB} KB`);
