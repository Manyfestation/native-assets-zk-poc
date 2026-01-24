/**
 * Compile Circom Circuit
 * 
 * Run: node scripts/compile.js
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROVER_DIR = path.join(__dirname, '..');
const CIRCUITS_DIR = path.join(PROVER_DIR, 'circuits');
const ARTIFACTS_DIR = path.join(PROVER_DIR, 'artifacts');

// Find circom binary
const getCircomBinary = () => {
    const platform = process.platform;
    let binaryName = 'circom';

    if (platform === 'darwin') binaryName = 'circom-macos-amd64';
    else if (platform === 'linux') binaryName = 'circom-linux-amd64';
    else if (platform === 'win32') binaryName = 'circom-windows-amd64.exe';

    const localBinPath = path.join(PROVER_DIR, '..', '..', 'bin', binaryName);
    if (existsSync(localBinPath)) {
        if (platform !== 'win32') {
            try { execSync(`chmod +x ${localBinPath}`); } catch (e) { }
        }
        return localBinPath;
    }
    return 'circom';
};

// Ensure artifacts directory exists
if (!existsSync(ARTIFACTS_DIR)) {
    mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

console.log('[COMPILE] Starting Circom circuit compilation...');
const start = Date.now();

const CIRCOM = getCircomBinary();

try {
    // Find circomlib
    const circomlibPaths = [
        path.join(PROVER_DIR, 'node_modules'),
        path.join(PROVER_DIR, '..', '..', 'circuits', 'node_modules'),
        path.join(PROVER_DIR, '..', '..', 'web', 'node_modules'),
    ].filter(p => existsSync(p));

    const includePaths = circomlibPaths.map(p => `-l ${p}`).join(' ');

    execSync(
        `${CIRCOM} ${path.join(CIRCUITS_DIR, 'token_transfer.circom')} --r1cs --wasm --sym -o ${ARTIFACTS_DIR} ${includePaths}`,
        { stdio: 'inherit' }
    );

    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`[COMPILE] Done in ${elapsed}s`);
    console.log(`[COMPILE] Artifacts: ${ARTIFACTS_DIR}`);
} catch (error) {
    console.error('[COMPILE] Failed:', error.message);
    process.exit(1);
}
