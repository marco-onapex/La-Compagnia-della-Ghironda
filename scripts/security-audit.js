#!/usr/bin/env node

import { execSync } from 'child_process';

console.log('🔐 Running security audit...\n');

try {
  // NPM audit
  console.log('📦 Checking npm dependencies...');
  execSync('npm audit --audit-level=high', { stdio: 'inherit' });
  console.log('✅ No high-severity vulnerabilities found\n');
} catch (error) {
  console.error('❌ Security vulnerabilities detected!');
  console.error('Run: npm audit fix\n');
  process.exit(1);
}

console.log('✅ All security checks passed!');
