/**
 * Build CSS Script
 * 
 * Concatena moduli CSS in ordine, rimuove @import statements,
 * poi minifica con csso. Permette modularità mentre produce
 * bundle minificato unico.
 * 
 * Utilizzo: node build-css.js
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSS_MODULES = [
  '1-variables.css',
  '2-reset.css',
  '3-typography.css',
  '4-header.css',
  '5-hero.css',
  '6-sections.css',
  '7-responsive.css',
  '8-print.css'
];

const CSS_DIR = path.join(__dirname, 'css');
const TEMP_FILE = path.join(CSS_DIR, '.style-temp.css');
const OUTPUT_FILE = path.join(__dirname, 'dist', 'style.min.css');

// 1. Concatena moduli
console.log('📦 Concatenating CSS modules...');
let concatenated = '';

CSS_MODULES.forEach((module) => {
  const filePath = path.join(CSS_DIR, module);
  if (!fs.existsSync(filePath)) {
    console.error(`[ERROR] CSS module not found: ${filePath}`);
    process.exit(1);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  concatenated += content + '\n\n';
});

// 2. Scrivi temp file
fs.writeFileSync(TEMP_FILE, concatenated);
console.log(`✅ Concatenated ${CSS_MODULES.length} modules`);

// 3. Minifica con csso
console.log('🔨 Minifying CSS...');
try {
  execSync(`csso "${TEMP_FILE}" -o "${OUTPUT_FILE}"`, { stdio: 'inherit' });
  console.log(`✅ Minified to ${OUTPUT_FILE}`);
} catch (error) {
  console.error('❌ Error minifying CSS:', error.message);
  process.exit(1);
}

// 4. Verify output
if (!fs.existsSync(OUTPUT_FILE) || fs.statSync(OUTPUT_FILE).size === 0) {
  console.error('[ERROR] Minification produced empty output');
  process.exit(1);
}

// 5. Cleanup
try {
  fs.unlinkSync(TEMP_FILE);
} catch (_e) {
  // Non-critical: temp file cleanup
}

// 5. Report size
const stats = fs.statSync(OUTPUT_FILE);
const sizeKB = (stats.size / 1024).toFixed(2);
console.log(`Final size: ${sizeKB} KB`);
