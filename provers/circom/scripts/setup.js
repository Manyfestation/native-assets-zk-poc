/**
 * Circom Trusted Setup (Groth16)
 * 
 * Run: node scripts/setup.js
 */

import { execSync } from 'child_process';
import { existsSync, copyFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROVER_DIR = path.join(__dirname, '..');
const ARTIFACTS_DIR = path.join(PROVER_DIR, 'artifacts');

const R1CS_FILE = path.join(ARTIFACTS_DIR, 'token_transfer.r1cs');
const PTAU_FILE = path.join(ARTIFACTS_DIR, 'pot15_final.ptau');
const ZKEY_FILE = path.join(ARTIFACTS_DIR, 'token_transfer.zkey');
const VKEY_FILE = path.join(ARTIFACTS_DIR, 'verification_key.json');

// Check if PTAU exists, if not copy from circuits folder
if (!existsSync(PTAU_FILE)) {
    const sourcePtau = path.join(PROVER_DIR, '..', '..', 'circuits', 'pot15_final.ptau');
    if (existsSync(sourcePtau)) {
        console.log('[SETUP] Copying PTAU file...');
        copyFileSync(sourcePtau, PTAU_FILE);
    } else {
        console.error('[SETUP] PTAU file not found. Download pot15_final.ptau first.');
        process.exit(1);
    }
}

if (!existsSync(R1CS_FILE)) {
    console.error('[SETUP] R1CS file not found. Run compile.js first.');
    process.exit(1);
}

console.log('[SETUP] Starting trusted setup...');
const start = Date.now();

try {
    // Generate zkey
    console.log('[SETUP] Generating proving key (zkey)...');
    execSync(
        `npx snarkjs groth16 setup ${R1CS_FILE} ${PTAU_FILE} ${ZKEY_FILE}`,
        { stdio: 'inherit', cwd: PROVER_DIR }
    );

    // Export verification key
    console.log('[SETUP] Exporting verification key...');
    execSync(
        `npx snarkjs zkey export verificationkey ${ZKEY_FILE} ${VKEY_FILE}`,
        { stdio: 'inherit', cwd: PROVER_DIR }
    );

    // Create metadata
    const metadata = {
        circuit: 'token_transfer',
        createdAt: new Date().toISOString(),
        ptau: 'pot15_final.ptau'
    };
    writeFileSync(
        path.join(ARTIFACTS_DIR, 'metadata.json'),
        JSON.stringify(metadata, null, 2)
    );

    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`[SETUP] Done in ${elapsed}s`);
} catch (error) {
    console.error('[SETUP] Failed:', error.message);
    process.exit(1);
}
