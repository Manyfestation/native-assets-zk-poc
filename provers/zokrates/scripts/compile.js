/**
 * Compile ZoKrates Circuit (Browser-based via WASM)
 * 
 * This script documents the compile process.
 * ZoKrates compilation happens in the browser using zokrates-js.
 * 
 * For CLI compilation, use the ZoKrates CLI:
 *   zokrates compile -i circuits/token_transfer.zok -o artifacts/
 *   zokrates setup
 * 
 * Run: node scripts/compile.js
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROVER_DIR = path.join(__dirname, '..');
const CIRCUITS_DIR = path.join(PROVER_DIR, 'circuits');
const ARTIFACTS_DIR = path.join(PROVER_DIR, 'artifacts');

// Ensure artifacts directory exists
if (!existsSync(ARTIFACTS_DIR)) {
    mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

console.log('[ZOKRATES] ZoKrates Compile Info');
console.log('================================');
console.log('');
console.log('ZoKrates circuits are compiled in the browser using zokrates-js WASM.');
console.log('The benchmark UI compiles on first run and caches the result.');
console.log('');
console.log('For CLI compilation (if you have ZoKrates installed):');
console.log('');
console.log('  cd provers/zokrates');
console.log('  zokrates compile -i circuits/token_transfer.zok');
console.log('  zokrates setup');
console.log('  zokrates export-verifier');
console.log('');
console.log('Circuit source:', path.join(CIRCUITS_DIR, 'token_transfer.zok'));
console.log('');

// Read and display circuit info
const circuitPath = path.join(CIRCUITS_DIR, 'token_transfer.zok');
if (existsSync(circuitPath)) {
    const content = readFileSync(circuitPath, 'utf8');
    const lines = content.split('\n').length;
    console.log(`Circuit: ${lines} lines`);

    // Extract main function signature
    const mainMatch = content.match(/def main\([^)]+\)/s);
    if (mainMatch) {
        console.log('\nMain function signature:');
        console.log(mainMatch[0]);
    }
} else {
    console.error('Circuit file not found!');
    process.exit(1);
}
