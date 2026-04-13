/**
 * Build CSS Script with Custom Minification
 *
 * Concatena moduli CSS in ordine, rimuove @import statements,
 * poi minifica mantenendo media queries (CSSO le rimuoveva).
 *
 * Utilizzo: node build-css.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSS_MODULES = [
  'fonts.css',
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
const OUTPUT_FILE = path.join(__dirname, 'dist', 'style.min.css');

/**
 * Simple CSS minifier that preserves media queries
 * (doesn't do dead code elimination like CSSO)
 */
function minifyCSS(css) {
  return css
    // Remove comments
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Remove tabs
    .replace(/\t/g, '')
    // Remove leading/trailing whitespace from lines
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('')
    // Add minimal spacing around braces
    .replace(/\s*{\s*/g, '{')
    .replace(/\s*}\s*/g, '}')
    .replace(/\s*;\s*/g, ';')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s*:\s*/g, ':')
    .replace(/\s*>\s*/g, '>')
    .replace(/\s*\+\s*/g, '+')
    .replace(/\s*~\s*/g, '~')
    // Preserve space after keywords (important for valid CSS)
    .replace(/(\w)@media/g, '$1 @media')
    // Clean up any double spaces
    .replace(/\s+/g, ' ')
    .trim();
}

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

console.log(`✅ Concatenated ${CSS_MODULES.length} modules`);

// 2. Minifica con custom function
console.log('🔨 Minifying CSS (custom minifier, preserves media queries)...');
let minified;
try {
  minified = minifyCSS(concatenated);
  fs.writeFileSync(OUTPUT_FILE, minified);
  console.log(`✅ Minified to ${OUTPUT_FILE}`);
} catch (error) {
  console.error('❌ Error minifying CSS:', error.message);
  process.exit(1);
}

// 3. Verify output
if (!minified || minified.length === 0) {
  console.error('[ERROR] Minification produced empty output');
  process.exit(1);
}

// 4. Verify media queries are preserved
const hasMediaQueries = /@media/.test(minified);
if (!hasMediaQueries) {
  console.warn('⚠️  WARNING: No @media queries found in minified output');
}

// 5. Report size
const stats = fs.statSync(OUTPUT_FILE);
const sizeKB = (stats.size / 1024).toFixed(2);
console.log(`✅ Final size: ${sizeKB} KB`);
console.log(`✅ Media queries preserved: ${hasMediaQueries ? 'YES' : 'NO'}`);
