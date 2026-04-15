#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const PERFORMANCE_BUDGET = {
  js:    { max: 5,  warn: 4  },  // KB gzip
  css:   { max: 10, warn: 8  },  // KB gzip
  total: { max: 14, warn: 11 },  // KB gzip
};

console.log('Checking performance budget (gzip sizes)...\n');

try {
  const distPath = path.join(process.cwd(), 'dist');

  if (!fs.existsSync(distPath)) {
    console.error('dist/ folder not found. Run: npm run build');
    process.exit(1);
  }

  let jsSize = 0;
  let cssSize = 0;

  const files = fs.readdirSync(distPath);

  files.forEach(file => {
    const filePath = path.join(distPath, file);
    const content = fs.readFileSync(filePath);
    const gzipSize = zlib.gzipSync(content).length;
    const sizeKB = (gzipSize / 1024).toFixed(2);

    if (file.endsWith('.js') && !file.endsWith('.map')) {
      jsSize = parseFloat(sizeKB);
      console.log(`${file}: ${sizeKB} KB (gzip)`);
    } else if (file.endsWith('.css')) {
      cssSize = parseFloat(sizeKB);
      console.log(`${file}: ${sizeKB} KB (gzip)`);
    }
  });

  const totalSize = jsSize + cssSize;
  let hasWarning = false;
  let hasError = false;

  console.log('\nPerformance Budget Analysis (gzip):\n');

  // Check JS
  if (jsSize > PERFORMANCE_BUDGET.js.max) {
    console.error(`JS exceeds max budget: ${jsSize} KB > ${PERFORMANCE_BUDGET.js.max} KB`);
    hasError = true;
  } else if (jsSize > PERFORMANCE_BUDGET.js.warn) {
    console.log(`JS approaching limit: ${jsSize} KB > ${PERFORMANCE_BUDGET.js.warn} KB (warning)`);
    hasWarning = true;
  } else {
    console.log(`JS within budget: ${jsSize} KB / ${PERFORMANCE_BUDGET.js.max} KB`);
  }

  // Check CSS
  if (cssSize > PERFORMANCE_BUDGET.css.max) {
    console.error(`CSS exceeds max budget: ${cssSize} KB > ${PERFORMANCE_BUDGET.css.max} KB`);
    hasError = true;
  } else if (cssSize > PERFORMANCE_BUDGET.css.warn) {
    console.log(`CSS approaching limit: ${cssSize} KB > ${PERFORMANCE_BUDGET.css.warn} KB (warning)`);
    hasWarning = true;
  } else {
    console.log(`CSS within budget: ${cssSize} KB / ${PERFORMANCE_BUDGET.css.max} KB`);
  }

  // Check Total
  if (totalSize > PERFORMANCE_BUDGET.total.max) {
    console.error(`Total exceeds max budget: ${totalSize} KB > ${PERFORMANCE_BUDGET.total.max} KB`);
    hasError = true;
  } else if (totalSize > PERFORMANCE_BUDGET.total.warn) {
    console.log(`Total approaching limit: ${totalSize} KB > ${PERFORMANCE_BUDGET.total.warn} KB (warning)`);
    hasWarning = true;
  } else {
    console.log(`Total within budget: ${totalSize} KB / ${PERFORMANCE_BUDGET.total.max} KB`);
  }

  if (hasError) {
    console.error('\nPerformance budget exceeded!');
    process.exit(1);
  }

  if (hasWarning) {
    console.log('\nPerformance budget warning (non-blocking)');
  } else {
    console.log('\nPerformance budget met');
  }

} catch (error) {
  console.error('Error checking performance budget:', error.message);
  process.exit(1);
}
