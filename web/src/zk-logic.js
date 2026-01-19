/**
 * ZK Logic - Zero-Knowledge proof operations
 * 
 * Exports:
 * - generateWallet() - Create ephemeral wallet identity
 * - buildWitness() - Build circuit witness for transfers
 * - generateProof() - Generate ZK proof
 * - runTrustedSetup() - Browser-based trusted setup for new tokens
 */

// snarkjs is loaded via CDN and available as window.snarkjs
const snarkjs = window.snarkjs;

// === CONSTANTS ===
const MAX_INPUTS = 10;
const MAX_OUTPUTS = 10;
const SCRIPT_LEN = 8;

// Circuit artifacts URLs
const WASM_URL = '/circuits/native_token_js/native_token.wasm';
const ZKEY_URL = '/circuits/native_token.zkey';
const VKEY_URL = '/circuits/verification_key.json';

// Cached artifacts
let cachedWasm = null;
let cachedZkey = null;
let cachedVkey = null;

// === WALLET GENERATION ===

/**
 * Generate a random ephemeral wallet identity
 * Returns a script pubkey (array of 8 numbers)
 */
export function generateWallet() {
    const scriptPubKey = [];
    for (let i = 0; i < SCRIPT_LEN; i++) {
        scriptPubKey.push(Math.floor(Math.random() * 256));
    }

    // Create a simple "address" string for display
    const address = '0x' + scriptPubKey
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 12) + '...';

    return { scriptPubKey, address };
}

// === WITNESS BUILDING ===

/**
 * Pad array to fixed length
 */
function padArray(arr, len, defaultVal = 0) {
    const result = [...arr];
    while (result.length < len) {
        result.push(defaultVal);
    }
    return result;
}

/**
 * Create zero script
 */
function zeroScript() {
    return new Array(SCRIPT_LEN).fill(0);
}

/**
 * Pad script array
 */
function padScriptArray(arr, len) {
    const result = [...arr];
    while (result.length < len) {
        result.push(zeroScript());
    }
    return result;
}

/**
 * Build witness for a token transfer (UTXO model)
 * 
 * In UTXO model:
 * - We spend sender's UTXO (prevOut)
 * - We create two new UTXOs: one for receiver (amount), one as change for sender
 * - Receiver's old balance is irrelevant - they just get a new UTXO
 * 
 * @param {number[]} covenant - The token's covenant script (8 bytes)
 * @param {number} amount - Amount to transfer
 * @param {number} senderBalance - Current balance of sender
 */
export function buildWitness(covenant, amount, senderBalance) {
    // Input: sender's UTXO with their balance
    const inputAmounts = padArray([senderBalance], MAX_INPUTS);
    const inputSpks = padScriptArray([covenant], MAX_INPUTS);

    // Output: two UTXOs - one to receiver, one change back to sender
    const outputAmounts = padArray([amount, senderBalance - amount], MAX_OUTPUTS);
    const outputSpks = padScriptArray([covenant, covenant], MAX_OUTPUTS);

    return {
        inputAmounts,
        inputSpks,
        currentInputIdx: 0,
        outputAmounts,
        outputSpks,
        numOutputs: 2
    };
}

// === ARTIFACT LOADING ===

/**
 * Load circuit artifacts (WASM, zkey, vkey)
 * Caches for subsequent calls
 */
export async function loadArtifacts(onLog) {
    if (cachedWasm && cachedZkey && cachedVkey) {
        onLog && onLog('Using cached artifacts');
        return { wasm: cachedWasm, zkey: cachedZkey, vkey: cachedVkey };
    }

    onLog && onLog('Loading circuit artifacts...');

    // Load WASM
    const wasmResponse = await fetch(WASM_URL);
    if (!wasmResponse.ok) throw new Error('Failed to load WASM');
    cachedWasm = await wasmResponse.arrayBuffer();

    // Load zkey
    const zkeyResponse = await fetch(ZKEY_URL);
    if (!zkeyResponse.ok) throw new Error('Failed to load zkey');
    cachedZkey = await zkeyResponse.arrayBuffer();

    // Load verification key
    const vkeyResponse = await fetch(VKEY_URL);
    if (!vkeyResponse.ok) throw new Error('Failed to load verification key');
    cachedVkey = await vkeyResponse.json();

    onLog && onLog('Artifacts loaded');

    return { wasm: cachedWasm, zkey: cachedZkey, vkey: cachedVkey };
}

// === PROOF GENERATION ===

/**
 * Generate a ZK proof for a token transfer
 * 
 * @param {object} witness - The circuit witness (from buildWitness)
 * @param {function} onLog - Logging callback
 * @returns {object} - { proof, publicSignals, proofTime, proofSize }
 */
export async function generateProof(witness, onLog) {
    const { wasm, zkey } = await loadArtifacts(onLog);

    onLog && onLog('Starting proof generation...');
    const start = Date.now();

    // Use snarkjs groth16 fullProve
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        witness,
        new Uint8Array(wasm),
        new Uint8Array(zkey)
    );

    const proofTime = Date.now() - start;

    // Calculate proof size in bytes
    const proofJson = JSON.stringify(proof);
    const proofSize = new Blob([proofJson]).size;

    onLog && onLog(`Proof generated in ${proofTime}ms (${proofSize} bytes)`);

    return { proof, publicSignals, proofTime, proofSize };
}


// === TRUSTED SETUP (BROWSER-SIDE) ===

/**
 * Run trusted setup for a new token in the browser
 * This generates the zkey (proving key) and vkey (verification key)
 * 
 * SECURITY: The "toxic waste" stays in the browser and is discarded.
 * 
 * @param {function} onLog - Logging callback
 * @param {function} onProgress - Progress callback (0-100)
 * @returns {object} - { zkey, vkey, setupTime, zkeySize }
 */
export async function runTrustedSetup(onLog, onProgress) {
    onLog && onLog('Starting trusted setup in browser...');
    onProgress && onProgress(0);

    const startTime = Date.now();

    // Load R1CS (circuit constraints)
    onLog && onLog('Loading circuit R1CS...');
    const r1csResponse = await fetch('/circuits/native_token.r1cs');
    if (!r1csResponse.ok) throw new Error('Failed to load R1CS');
    const r1cs = new Uint8Array(await r1csResponse.arrayBuffer());
    onProgress && onProgress(20);

    // Load Powers of Tau (universal setup)
    onLog && onLog('Loading Powers of Tau...');
    const ptauResponse = await fetch('/circuits/pot15_final.ptau');
    if (!ptauResponse.ok) throw new Error('Failed to load PTAU');
    const ptau = new Uint8Array(await ptauResponse.arrayBuffer());
    onProgress && onProgress(40);

    // Generate zkey (this is the slow part)
    onLog && onLog('Generating zkey (proving key)...');
    const zkey = { type: 'mem' };
    await snarkjs.zKey.newZKey(r1cs, ptau, zkey);
    onProgress && onProgress(80);

    // Export verification key
    onLog && onLog('Exporting verification key...');
    const vkey = await snarkjs.zKey.exportVerificationKey(zkey);
    onProgress && onProgress(100);

    const setupTime = Date.now() - startTime;

    // Calculate zkey size (approximate)
    const zkeyData = zkey.data;
    const zkeySize = zkeyData ? zkeyData.byteLength : 0;

    onLog && onLog(`Trusted setup complete in ${setupTime}ms`);

    return { zkey, vkey, setupTime, zkeySize };
}
