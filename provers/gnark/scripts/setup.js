/**
 * Setup Gnark Circuit
 * 
 * Runs the Go CLI to perform Trusted Setup (generate PK/VK).
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROVER_DIR = path.join(__dirname, '..');

console.log('[GNARK] Running Setup...');
try {
    execSync('go run cmd/main.go -action setup -output artifacts', {
        cwd: PROVER_DIR,
        stdio: 'inherit'
    });
    console.log('Success!');
} catch (error) {
    console.error('Setup failed:', error);
    process.exit(1);
}
