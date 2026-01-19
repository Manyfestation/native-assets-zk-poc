/**
 * Trusted Setup for the simplified circuit
 * Run: node scripts/trusted-setup.js
 */

import * as snarkjs from 'snarkjs';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BUILD_DIR = path.join(ROOT, 'public', 'circuits');
const PTAU_PATH = path.join(ROOT, '..', 'circuits', 'pot15_final.ptau');

async function runSetup() {
    console.log('[SETUP] Starting trusted setup ceremony...');
    const timings = {};

    // Check prerequisites
    const r1csPath = path.join(BUILD_DIR, 'native_token.r1cs');
    if (!existsSync(r1csPath)) {
        console.error('[SETUP] Circuit not compiled. Run: npm run compile:circuit');
        process.exit(1);
    }

    if (!existsSync(PTAU_PATH)) {
        console.error('[SETUP] Powers of Tau file not found at:', PTAU_PATH);
        console.error('[SETUP] Run the circuit setup first: cd ../circuits && ./scripts/setup_ptau.sh');
        process.exit(1);
    }

    // Phase 2: Circuit-specific setup
    console.log('[SETUP] Running Phase 2 (circuit-specific)...');
    let start = Date.now();

    const zkeyPath = path.join(BUILD_DIR, 'native_token.zkey');
    await snarkjs.zKey.newZKey(r1csPath, PTAU_PATH, zkeyPath);

    timings.phase2 = Date.now() - start;
    console.log(`[SETUP] Phase 2 complete: ${(timings.phase2 / 1000).toFixed(2)}s`);

    // Export verification key
    console.log('[SETUP] Exporting verification key...');
    start = Date.now();

    const vkey = await snarkjs.zKey.exportVerificationKey(zkeyPath);
    writeFileSync(
        path.join(BUILD_DIR, 'verification_key.json'),
        JSON.stringify(vkey, null, 2)
    );

    timings.exportVkey = Date.now() - start;
    console.log(`[SETUP] Verification key exported: ${(timings.exportVkey / 1000).toFixed(2)}s`);

    // Summary
    console.log('\n--- TRUSTED SETUP COMPLETE ---');
    console.log(`Phase 2:      ${(timings.phase2 / 1000).toFixed(2)}s`);
    console.log(`Export vkey:  ${(timings.exportVkey / 1000).toFixed(2)}s`);
    console.log(`Total:        ${((timings.phase2 + timings.exportVkey) / 1000).toFixed(2)}s`);
    console.log('Artifacts:', BUILD_DIR);
}

runSetup().catch(err => {
    console.error('[SETUP] Error:', err);
    process.exit(1);
});
