/**
 * Compile Gnark Circuit
 * 
 * Runs the Go CLI to compile the circuit and generate attributes.
 * Also builds the WASM binary for the web prover.
 */

import { execSync } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROVER_DIR = path.join(__dirname, '..');
const ARTIFACTS_DIR = path.join(PROVER_DIR, 'artifacts');

if (!existsSync(ARTIFACTS_DIR)) {
    mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

console.log('[GNARK] Compiling Circuit...');
try {
    // 1. Run Go Compile to generate circuit.ccs (for potential debug/setup)
    execSync('go run cmd/main.go -action compile -output artifacts', {
        cwd: PROVER_DIR,
        stdio: 'inherit'
    });

    // 2. Build WASM for Web
    console.log('[GNARK] Building WASM...');
    execSync('GOOS=js GOARCH=wasm go build -o artifacts/prover.wasm cmd/wasm/main.go', {
        cwd: PROVER_DIR,
        stdio: 'inherit'
    });

    console.log('Success!');
} catch (error) {
    console.error('Compilation failed:', error);
    process.exit(1);
}
