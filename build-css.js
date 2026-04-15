/**
 * Build CSS Script with Custom Minification + HTML Injection
 *
 * Concatena moduli CSS in ordine, rimuove @import statements,
 * minifica mantenendo media queries, poi inietta CSS inline in
 * index.html tra i marcatori CSS:BEGIN / CSS:END.
 *
 * Font path fix: i percorsi relativi a dist/ (url('../fonts/'))
 * vengono corretti per la versione inline (url('fonts/')).
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
const HTML_FILE = path.join(__dirname, 'index.html');

const CSS_INJECT_START = '<!-- CSS:BEGIN -->';
const CSS_INJECT_END = '<!-- CSS:END -->';

/**
 * Simple CSS minifier that preserves media queries
 */
function minifyCSS(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\t/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('')
    .replace(/\s*{\s*/g, '{')
    .replace(/\s*}\s*/g, '}')
    .replace(/\s*;\s*/g, ';')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s*:\s*/g, ':')
    .replace(/\s*>\s*/g, '>')
    .replace(/\s*\+\s*/g, '+')
    .replace(/\s*~\s*/g, '~')
    .replace(/(\w)@media/g, '$1 @media')
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

// 2. Minifica
console.log('🔨 Minifying CSS...');
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });

let minified;
try {
  minified = minifyCSS(concatenated);
  fs.writeFileSync(OUTPUT_FILE, minified);
  console.log(`✅ Minified to ${OUTPUT_FILE}`);
} catch (error) {
  console.error('❌ Error minifying CSS:', error.message);
  process.exit(1);
}

if (!minified || minified.length === 0) {
  console.error('[ERROR] Minification produced empty output');
  process.exit(1);
}

const hasMediaQueries = /@media/.test(minified);
if (!hasMediaQueries) {
  console.warn('⚠️  WARNING: No @media queries found in minified output');
}

const stats = fs.statSync(OUTPUT_FILE);
const sizeKB = (stats.size / 1024).toFixed(2);
console.log(`✅ dist/style.min.css: ${sizeKB} KB | Media queries: ${hasMediaQueries ? 'YES' : 'NO'}`);

// 3. Crea versione inline (fix percorsi relativi per index.html alla root)
//    dist/style.min.css usa url('../fonts/...') che è corretto relativo a dist/
//    index.html alla root usa url('fonts/...') — basta rimuovere '../'
const inlineCSS = minified.replace(/url\('\.\.\/fonts\//g, "url('fonts/");

// 4. Inietta in index.html tra i marcatori CSS:BEGIN / CSS:END
if (!fs.existsSync(HTML_FILE)) {
  console.warn('⚠️  index.html non trovato, salto injection');
} else {
  const html = fs.readFileSync(HTML_FILE, 'utf8');
  const startIdx = html.indexOf(CSS_INJECT_START);
  const endIdx = html.indexOf(CSS_INJECT_END);

  if (startIdx === -1 || endIdx === -1) {
    console.warn('⚠️  Marcatori CSS:BEGIN/CSS:END non trovati in index.html, salto injection');
  } else {
    const before = html.substring(0, startIdx + CSS_INJECT_START.length);
    const after = html.substring(endIdx);
    const newHTML = before + `<style>${inlineCSS}</style>` + after;
    fs.writeFileSync(HTML_FILE, newHTML);
    const htmlSize = (Buffer.byteLength(newHTML, 'utf8') / 1024).toFixed(2);
    console.log(`✅ CSS iniettato in index.html (HTML totale: ${htmlSize} KB)`);
  }
}
