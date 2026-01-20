/**
 * Compile the simplified circuit
 * Run: node scripts/compile-circuit.js
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, copyFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CIRCUITS_DIR = path.join(ROOT, 'circuits');
const BUILD_DIR = path.join(ROOT, 'public', 'circuits');
const PTAU_SOURCE = path.join(ROOT, '..', 'circuits', 'pot15_final.ptau');
const PTAU_DEST = path.join(BUILD_DIR, 'pot15_final.ptau');

// Ensure build directory exists
if (!existsSync(BUILD_DIR)) {
    mkdirSync(BUILD_DIR, { recursive: true });
}

console.log('[COMPILE] Starting circuit compilation...');
const start = Date.now();

// Find circom binary
const getCircomBinary = () => {
    const platform = process.platform;
    let binaryName = 'circom';

    if (platform === 'darwin') {
        binaryName = 'circom-macos-amd64';
    } else if (platform === 'linux') {
        binaryName = 'circom-linux-amd64';
    } else if (platform === 'win32') {
        binaryName = 'circom-windows-amd64.exe';
    }

    // Check project-local bin directory
    const localBinPath = path.join(ROOT, '..', 'bin', binaryName);
    if (existsSync(localBinPath)) {
        // Ensure it's executable
        if (platform !== 'win32') {
            try {
                // chmod +x
                execSync(`chmod +x ${localBinPath}`);
            } catch (e) {
                console.warn('[COMPILE] Failed to set executable permissions on local binary');
            }
        }
        return localBinPath;
    }

    // Fallback to global
    return 'circom';
};

const CIRCOM = getCircomBinary();

try {
    // Find circomlib location (could be in ../circuits/node_modules or ./node_modules)
    const parentCircomlibPath = path.join(ROOT, '..', 'circuits', 'node_modules');
    const localNodeModules = path.join(ROOT, 'node_modules');

    // Build include paths
    let includePaths = '';
    if (existsSync(parentCircomlibPath)) {
        includePaths += ` -l ${parentCircomlibPath}`;
    }
    if (existsSync(localNodeModules)) {
        includePaths += ` -l ${localNodeModules}`;
    }
    // Add project root as fallback
    includePaths += ` -l ${path.join(ROOT, '..')}`;

    // Compile circuit
    execSync(
        `${CIRCOM} ${path.join(CIRCUITS_DIR, 'native_token.circom')} --r1cs --wasm --sym -o ${BUILD_DIR}${includePaths}`,
        { stdio: 'inherit', cwd: ROOT }
    );

    // Copy PTAU file for browser-side trusted setup
    if (existsSync(PTAU_SOURCE) && !existsSync(PTAU_DEST)) {
        copyFileSync(PTAU_SOURCE, PTAU_DEST);
        console.log('[COMPILE] Copied PTAU file for browser setup');
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`[COMPILE] Circuit compiled in ${elapsed}s`);
    console.log(`[COMPILE] Output: ${BUILD_DIR}`);
} catch (error) {
    console.error('[COMPILE] Failed:', error.message);
    process.exit(1);
}
