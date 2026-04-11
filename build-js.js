#!/usr/bin/env node

/**
 * JavaScript Build Script - Module Bundling & Minification
 * 
 * Concatena i moduli ES6 in un singolo file prima di minificare con Terser.
 * Necessario perché Terser minifica ma non bundla gli import ES6.
 * 
 * Algoritmo:
 * 1. Leggi tutti i moduli in js/modules/ (in ordine di dipendenza)
 * 2. Estrai il contenuto funzionale (rimuovi export)
 * 3. Concatena in ordine nella main.js
 * 4. Minifica il risultato con Terser
 * 5. Salva in dist/main.min.js con sourcemap
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ordine di caricamento (per dipendenze)
const modules = [
  'js/config.js',                    // Config DEVE essere prima di tutto
  'js/modules/polyfills.js',
  'js/modules/header.js',
  'js/modules/observer.js',
  'js/modules/hero.js',
  'js/main.js'  // Main orchestrator
];

console.log('📦 Bundling JavaScript modules...');

try {
  // 1. CONCATENA I MODULI
  let bundledCode = '';
  
  for (const module of modules) {
    const filePath = path.join(__dirname, module);
    let content = fs.readFileSync(filePath, 'utf-8');
    
    // Rimuovi BOM (Byte Order Mark) se presente
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }
    
    // Rimuovi import/export ES6 per il bundling
    // 1. Rimuovi TUTTI gli import statement (indipendentemente dal modulo)
    content = content.replace(/^import\s+.*from\s+['"][^'"]*['"]\s*;?\s*$/gm, '');
    
    // 2. Rimuovi TUTTI gli export keyword
    content = content.replace(/^export\s+/gm, '');
    
    // 3. Rimuovi righe vuote multiple
    content = content.replace(/\n\n+/g, '\n\n');
    
    // Aggiunge una riga vuota tra moduli per leggibilità
    content += '\n\n';
    
    bundledCode += content;
  }
  
  // 2. SALVA VERSIONE TEMPORANEA CONCATENATA
  const tempFile = path.join(__dirname, 'js/main-bundled.js');
  fs.writeFileSync(tempFile, bundledCode);
  console.log(`[OK] Bundled ${modules.length} modules`);
  
  // 3. MINIFICA CON TERSER
  console.log('🔨 Minifying JavaScript...');
  
  // Quoti il path per compatibilità Windows
  const quotedTempFile = `"${tempFile}"`;
  const quotedOutFile = `"${path.join(__dirname, 'dist/main.min.js')}"`;
  
  execSync(`terser ${quotedTempFile} -o ${quotedOutFile} --source-map`, {
    stdio: 'inherit'
  });
  
  console.log('✅ Minified');
  
  // 4. CLEANUP
  fs.unlinkSync(tempFile);
  console.log('✅ Cleanup temp file');
  
  // 5. REPORT
  const stats = fs.statSync(path.join(__dirname, 'dist/main.min.js'));
  const sizeKB = (stats.size / 1024).toFixed(2);
  console.log(`📊 Final size: ${sizeKB} KB`);
  
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}
