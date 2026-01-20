/**
 * ZK Logic - Zero-Knowledge proof operations with EdDSA signatures
 * 
 * Exports:
 * - generateWallet() - Create EdDSA keypair wallet
 * - buildWitness() - Build circuit witness with signature
 * - generateProof() - Generate ZK proof
 * - runTrustedSetup() - Browser-based trusted setup
 */

import * as circomlibjs from 'circomlibjs';

// snarkjs loaded via CDN (window global)
const snarkjs = window.snarkjs;

// === CONSTANTS ===
const MAX_OUTPUTS = 10;

// Circuit artifacts URLs
const WASM_URL = '/circuits/native_token_js/native_token.wasm';
const ZKEY_URL = '/circuits/native_token.zkey';
const VKEY_URL = '/circuits/verification_key.json';

// Cached artifacts
let cachedWasm = null;
let cachedZkey = null;
let cachedVkey = null;

// Crypto primitives (initialized lazily)
let eddsa = null;
let poseidon = null;
let F = null;

/**
 * Initialize crypto primitives from circomlibjs
 */
async function initCrypto() {
    if (eddsa && poseidon) return;

    eddsa = await circomlibjs.buildEddsa();
    poseidon = await circomlibjs.buildPoseidon();
    F = poseidon.F;
}

// === WALLET GENERATION ===

/**
 * Generate an EdDSA keypair wallet
 * Returns { privateKey, publicKey: {x, y}, address }
 */
export async function generateWallet() {
    await initCrypto();

    // Generate random 32-byte private key
    const privateKey = new Uint8Array(32);
    crypto.getRandomValues(privateKey);

    // Derive public key
    const pubKey = eddsa.prv2pub(privateKey);

    // Convert to field elements for circuit
    const pubKeyX = F.toObject(pubKey[0]);
    const pubKeyY = F.toObject(pubKey[1]);

    // Create address string for display
    const address = '0x' + pubKeyX.toString(16).slice(0, 12) + '...';

    return {
        privateKey,
        publicKey: { x: pubKeyX, y: pubKeyY },
        address
    };
}

// === WITNESS BUILDING ===

function padArray(arr, len, defaultVal = 0n) {
    const result = [...arr];
    while (result.length < len) {
        result.push(defaultVal);
    }
    return result;
}

/**
 * Build witness for a token transfer with EdDSA signature
 * 
 * Single input UTXO model:
 * - One input UTXO (the sender's balance being spent)
 * - Multiple output UTXOs (recipient + change back to sender)
 * 
 * @param {object} senderWallet - Sender's wallet { privateKey, publicKey }
 * @param {object} recipientPubKey - Recipient's public key { x, y }
 * @param {bigint} script - Token type / script hash
 * @param {bigint} amount - Amount to transfer
 * @param {bigint} senderBalance - Current balance of sender (input UTXO amount)
 */
export async function buildWitness(senderWallet, recipientPubKey, script, amount, senderBalance) {
    await initCrypto();

    // Convert to BigInt
    amount = BigInt(amount);
    senderBalance = BigInt(senderBalance);
    script = BigInt(script);

    // Single input UTXO: sender's balance
    const inputAmount = senderBalance;
    const inputScript = script;
    const inputOwnerPubKeyX = senderWallet.publicKey.x;
    const inputOwnerPubKeyY = senderWallet.publicKey.y;

    // Output UTXOs: one to recipient, one change back to sender
    const change = senderBalance - amount;
    const outputAmounts = padArray([amount, change], MAX_OUTPUTS, 0n);
    const outputScripts = padArray([script, script], MAX_OUTPUTS, 0n);
    const outputOwnerPubKeyX = padArray([recipientPubKey.x, senderWallet.publicKey.x], MAX_OUTPUTS, 0n);
    const outputOwnerPubKeyY = padArray([recipientPubKey.y, senderWallet.publicKey.y], MAX_OUTPUTS, 0n);

    // Compute output commitment (must match circuit's computation)
    const outputCommitment = computeOutputCommitment(
        outputAmounts, outputScripts, outputOwnerPubKeyX
    );

    // Compute signature message: Poseidon(inputAmount, inputScript, outputCommitment)
    const msgHash = poseidon([inputAmount, inputScript, outputCommitment]);

    // Sign the message - signPoseidon expects the raw Poseidon output (field element)
    const signature = eddsa.signPoseidon(senderWallet.privateKey, msgHash);

    // Extract signature components
    const sigR8x = F.toObject(signature.R8[0]);
    const sigR8y = F.toObject(signature.R8[1]);
    const sigS = signature.S;

    return {
        // Single input UTXO
        inputAmount: inputAmount.toString(),
        inputScript: inputScript.toString(),
        inputOwnerPubKeyX: inputOwnerPubKeyX.toString(),
        inputOwnerPubKeyY: inputOwnerPubKeyY.toString(),

        // Signature
        sigR8x: sigR8x.toString(),
        sigR8y: sigR8y.toString(),
        sigS: sigS.toString(),

        // Output UTXOs
        outputAmounts: outputAmounts.map(x => x.toString()),
        outputScripts: outputScripts.map(x => x.toString()),
        outputOwnerPubKeyX: outputOwnerPubKeyX.map(x => x.toString()),
        outputOwnerPubKeyY: outputOwnerPubKeyY.map(x => x.toString()),
        numOutputs: "2"
    };
}

/**
 * Compute output commitment using tree-based Poseidon (matches circuit)
 */
function computeOutputCommitment(amounts, scripts, pubKeyX) {
    // Flatten to array of 30 elements (10 outputs * 3 fields each)
    const data = [];
    for (let i = 0; i < MAX_OUTPUTS; i++) {
        data.push(amounts[i]);
        data.push(scripts[i]);
        data.push(pubKeyX[i]);
    }

    // Hash in chunks of 8, then hash results (matches HashArray template)
    const numChunks = Math.ceil(data.length / 8);
    const chunkHashes = [];

    for (let c = 0; c < numChunks; c++) {
        const chunk = [];
        for (let i = 0; i < 8; i++) {
            const idx = c * 8 + i;
            chunk.push(idx < data.length ? data[idx] : 0n);
        }
        const hash = poseidon(chunk);
        chunkHashes.push(F.toObject(hash));
    }

    // Hash chunk results
    const finalHash = poseidon(chunkHashes);
    return F.toObject(finalHash);
}

/**
 * Generate a script hash for a new token
 */
export async function generateCovenant(tokenName) {
    await initCrypto();

    // Hash token name to create script hash
    const encoder = new TextEncoder();
    const nameBytes = encoder.encode(tokenName);

    // Convert first few bytes to field elements and hash
    const fields = [];
    for (let i = 0; i < Math.min(8, nameBytes.length); i++) {
        fields.push(BigInt(nameBytes[i]));
    }
    while (fields.length < 8) {
        fields.push(0n);
    }

    const hash = poseidon(fields);
    return F.toObject(hash);
}

// === ARTIFACT LOADING ===

export async function loadArtifacts(onLog) {
    if (cachedWasm && cachedZkey && cachedVkey) {
        onLog && onLog('Using cached artifacts');
        return { wasm: cachedWasm, zkey: cachedZkey, vkey: cachedVkey };
    }

    onLog && onLog('Loading circuit artifacts...');

    const wasmResponse = await fetch(WASM_URL);
    if (!wasmResponse.ok) throw new Error('Failed to load WASM');
    cachedWasm = await wasmResponse.arrayBuffer();

    const zkeyResponse = await fetch(ZKEY_URL);
    if (!zkeyResponse.ok) throw new Error('Failed to load zkey');
    cachedZkey = await zkeyResponse.arrayBuffer();

    const vkeyResponse = await fetch(VKEY_URL);
    if (!vkeyResponse.ok) throw new Error('Failed to load verification key');
    cachedVkey = await vkeyResponse.json();

    onLog && onLog('Artifacts loaded');
    return { wasm: cachedWasm, zkey: cachedZkey, vkey: cachedVkey };
}

// === PROOF GENERATION ===

export async function generateProof(witness, onLog) {
    const { wasm, zkey } = await loadArtifacts(onLog);

    onLog && onLog('Starting proof generation...');
    const start = Date.now();

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        witness,
        new Uint8Array(wasm),
        new Uint8Array(zkey)
    );

    const proofTime = Date.now() - start;
    const proofJson = JSON.stringify(proof);
    const proofSize = new Blob([proofJson]).size;

    onLog && onLog(`Proof generated in ${proofTime}ms (${proofSize} bytes)`);

    return { proof, publicSignals, proofTime, proofSize };
}

// === TRUSTED SETUP ===

export async function runTrustedSetup(onLog, onProgress) {
    onLog && onLog('Starting trusted setup in browser...');
    onProgress && onProgress(0);

    const startTime = Date.now();

    onLog && onLog('Loading circuit R1CS...');
    const r1csResponse = await fetch('/circuits/native_token.r1cs');
    if (!r1csResponse.ok) throw new Error('Failed to load R1CS');
    const r1cs = new Uint8Array(await r1csResponse.arrayBuffer());
    onProgress && onProgress(20);

    onLog && onLog('Loading Powers of Tau...');
    const ptauResponse = await fetch('/circuits/pot15_final.ptau');
    if (!ptauResponse.ok) throw new Error('Failed to load PTAU');
    const ptau = new Uint8Array(await ptauResponse.arrayBuffer());
    onProgress && onProgress(40);

    onLog && onLog('Generating zkey (proving key)...');
    const zkey = { type: 'mem' };
    await snarkjs.zKey.newZKey(r1cs, ptau, zkey);
    onProgress && onProgress(80);

    onLog && onLog('Exporting verification key...');
    const vkey = await snarkjs.zKey.exportVerificationKey(zkey);
    onProgress && onProgress(100);

    const setupTime = Date.now() - startTime;
    const zkeyData = zkey.data;
    const zkeySize = zkeyData ? zkeyData.byteLength : 0;

    onLog && onLog(`Trusted setup complete in ${setupTime}ms`);

    return { zkey, vkey, setupTime, zkeySize };
}
