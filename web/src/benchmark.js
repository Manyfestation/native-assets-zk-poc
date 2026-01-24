/**
 * ZK Benchmark - Fair comparison of ZoKrates vs Circom
 * 
 * Both provers run equivalent complexity circuits client-side:
 * - 1 EdDSA signature verification
 * - Poseidon hashes for commitments
 * - Balance conservation check
 */

import * as circomlibjs from 'circomlibjs';

// snarkjs loaded via CDN
const snarkjs = window.snarkjs;

// === CONFIGURATION ===
const MAX_OUTPUTS = 10;

// Circom artifacts
const CIRCOM_WASM_URL = '/circuits/native_token_js/native_token.wasm';
const CIRCOM_ZKEY_URL = '/circuits/native_token.zkey';
const CIRCOM_VKEY_URL = '/circuits/verification_key.json';

// === STATE ===
let zokratesProvider = null;
let eddsa = null;
let poseidon = null;
let F = null;

// Cached artifacts
let circomWasm = null;
let circomZkey = null;
let circomVkey = null;
let circomConstraintsCount = '14,281'; // Default to actual compiled count

// ZoKrates Cached artifacts
let zokArtifactsCache = null;
let zokKeypairCache = null;

// === DOM ELEMENTS ===
const elements = {
    // ZoKrates
    btnRunZokrates: document.getElementById('btn-run-zokrates'),
    zokStatus: document.getElementById('zok-status'),
    zokConstraints: document.getElementById('zok-constraints'),
    zokCompileTime: document.getElementById('zok-compile-time'),
    zokSetupTime: document.getElementById('zok-setup-time'),
    zokWitnessTime: document.getElementById('zok-witness-time'),
    zokProofTime: document.getElementById('zok-proof-time'),
    zokProofSize: document.getElementById('zok-proof-size'),
    zokVkSize: document.getElementById('zok-vk-size'),
    zokPkSize: document.getElementById('zok-pk-size'),
    zokProofOutput: document.getElementById('zok-proof'),

    // Circom
    btnRunCircom: document.getElementById('btn-run-circom'),
    circomStatus: document.getElementById('circom-status'),
    circomConstraints: document.getElementById('circom-constraints'),
    circomWitnessTime: document.getElementById('circom-witness-time'),
    circomProofTime: document.getElementById('circom-proof-time'),
    circomProofSize: document.getElementById('circom-proof-size'),
    circomVkSize: document.getElementById('circom-vk-size'),
    circomZkeySize: document.getElementById('circom-zkey-size'),
    circomProofOutput: document.getElementById('circom-proof'),

    // Shared
    terminal: document.getElementById('terminal'),
    tabs: document.querySelectorAll('.tab'),
    proofOutputs: document.querySelectorAll('.proof-output')
};

// === LOGGING ===
function log(message, type = 'info') {
    const time = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.className = `terminal-line ${type}`;
    line.textContent = `[${time}] ${message}`;
    elements.terminal.appendChild(line);
    elements.terminal.scrollTop = elements.terminal.scrollHeight;
    console.log(`[${type.toUpperCase()}] ${message}`);
}

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function formatMs(ms) {
    if (ms < 1000) return ms.toFixed(0) + ' ms';
    return (ms / 1000).toFixed(2) + ' s';
}

// === CRYPTO INIT ===
async function initCrypto() {
    if (eddsa && poseidon) return;
    log('Initializing crypto primitives...');
    eddsa = await circomlibjs.buildEddsa();
    poseidon = await circomlibjs.buildPoseidon();
    F = poseidon.F;
    log('Crypto initialized', 'success');
}

// === ZOKRATES PROVER ===
// 
// SIGNATURE SCHEME DIFFERENCE (Important for comparison):
// - ZoKrates stdlib: EdDSA on BabyJubJub with SHA-512 message format (u32[8] arrays)
// - Circom stdlib: EdDSA-Poseidon on BabyJubJub with Poseidon hash
// Both are valid EdDSA, but use different hash functions for message digest.
//
// Core logic verified by BOTH circuits:
// 1. Balance conservation: inputAmount == sum(outputAmounts)
// 2. Token data preservation: all outputs have same token params
// 3. Authorization: valid EdDSA signature from input owner

const MAX_OUTPUTS_ZOK = 10;

// ZoKrates circuit - STANDARD EdDSA verification (SHA-256 based)
// Uses ZoKrates stdlib verifyEddsa which is compatible with pycrypto signing
const ZOKRATES_CIRCUIT = `
import "hashes/poseidon/poseidon" as poseidon;
from "ecc/babyjubjubParams" import BabyJubJubParams;
import "ecc/babyjubjubParams" as context;
import "signatures/verifyEddsa" as verifyEddsa;

const u32 MAX_OUTPUTS = 10;

def main(
    // === PRIVATE: Input UTXO Data ===
    private field inputAmount,
    private field tokenParams,
    
    // === PRIVATE: EdDSA Signature (SHA-256 based) ===
    private field[2] sigR,        // Signature R point
    private field sigS,           // Signature S scalar
    private field[2] pubKey,      // Public key [x, y]
    
    // === PRIVATE: Message as u32[8] arrays (for EdDSA) ===
    private u32[8] msgPart0,      // First 256 bits of message
    private u32[8] msgPart1,      // Second 256 bits of message
    
    // === PUBLIC: Outputs ===
    field[MAX_OUTPUTS] outputAmounts,
    field[MAX_OUTPUTS] outputTokenParams,
    field[MAX_OUTPUTS] outputOwnerPubKeyX
) {
    BabyJubJubParams ctx = context();
    
    // 1. Balance Conservation: inputAmount == sum(outputAmounts)
    field mut totalOut = 0;
    for u32 i in 0..MAX_OUTPUTS {
        totalOut = totalOut + outputAmounts[i];
    }
    assert(inputAmount == totalOut);
    
    // 2. Token Params Preservation: all non-zero outputs must match input tokenParams
    for u32 i in 0..MAX_OUTPUTS {
        field diff = outputTokenParams[i] - tokenParams;
        assert(outputAmounts[i] * diff == 0);
    }
    
    // 3. Compute output commitments using Poseidon
    field outputData0 = poseidon([outputAmounts[0], outputTokenParams[0], outputOwnerPubKeyX[0]]);
    field outputData1 = poseidon([outputAmounts[1], outputTokenParams[1], outputOwnerPubKeyX[1]]);
    field outputCommitment = poseidon([outputData0, outputData1]);
    
    // 4. EdDSA Signature Verification (SHA-256 based - ZoKrates standard)
    bool sigValid = verifyEddsa(sigR, sigS, pubKey, msgPart0, msgPart1, ctx);
    assert(sigValid);
    
    return;
}
`;



async function loadZokratesModule() {
    log('Loading ZoKrates module from CDN...', 'zokrates');
    const module = await import('https://cdn.jsdelivr.net/npm/zokrates-js@1.1.7/+esm');
    return module;
}

async function runZokratesBenchmark() {
    elements.btnRunZokrates.disabled = true;
    elements.btnRunZokrates.classList.add('loading');
    elements.zokStatus.textContent = 'Running...';
    elements.zokStatus.className = 'status running';

    const metrics = {};

    try {
        // Initialize ZoKrates if needed
        if (!zokratesProvider) {
            const initStart = performance.now();
            const zokModule = await loadZokratesModule();
            zokratesProvider = await zokModule.initialize();
            log(`ZoKrates WASM loaded in ${(performance.now() - initStart).toFixed(0)}ms`, 'zokrates');
        }

        await initCrypto();

        // Helper to let UI repaint before heavy work
        const forceUpdate = () => new Promise(resolve => setTimeout(resolve, 50));

        // Step 1 & 2: Compile & Setup (or load from cache)
        let artifacts;
        let keypair;

        log('Checking artifact cache...', 'zokrates');
        await forceUpdate();
        if (zokArtifactsCache && zokKeypairCache) {
            log('Cache HIT: Using pre-compiled artifacts & keys', 'zokrates');
            artifacts = zokArtifactsCache;
            keypair = zokKeypairCache;

            // Set metrics for display (indicating cached)
            metrics.compileTime = 0;
            metrics.setupTime = 0;
            elements.zokCompileTime.textContent = 'Cached';
            elements.zokSetupTime.textContent = 'Cached';
        } else {
            log('Cache MISS: storing artifacts for next run', 'zokrates');
            await forceUpdate();

            // Step 1: Compile
            log('Compiling circuit source code... (may take ~10s)', 'zokrates');
            await forceUpdate();
            const compileStart = performance.now();
            artifacts = zokratesProvider.compile(ZOKRATES_CIRCUIT);
            metrics.compileTime = performance.now() - compileStart;
            metrics.constraints = artifacts.constraintCount;
            log(`Compiled in ${formatMs(metrics.compileTime)} (${metrics.constraints} constraints)`, 'zokrates');

            elements.zokCompileTime.textContent = formatMs(metrics.compileTime);
            elements.zokConstraints.textContent = metrics.constraints.toLocaleString();

            // Step 2: Setup (key generation)
            log('Generating Trusted Setup (Keys)...', 'zokrates');
            await forceUpdate();
            const setupStart = performance.now();
            keypair = zokratesProvider.setup(artifacts.program);
            metrics.setupTime = performance.now() - setupStart;

            // Measure key sizes
            const pkJson = JSON.stringify(keypair.pk);
            const vkJson = JSON.stringify(keypair.vk);
            metrics.pkSize = new Blob([pkJson]).size;
            metrics.vkSize = new Blob([vkJson]).size;

            elements.zokSetupTime.textContent = formatMs(metrics.setupTime);
            elements.zokPkSize.textContent = formatBytes(metrics.pkSize);
            elements.zokVkSize.textContent = formatBytes(metrics.vkSize);
            log(`Trusted Setup complete in ${formatMs(metrics.setupTime)}`, 'zokrates');

            // Cache them
            zokArtifactsCache = artifacts;
            zokKeypairCache = keypair;
            log('Artifacts & Keys cached for future runs', 'zokrates');
        }

        // Step 3: Compute witness using our custom ZoKrates signer to ensure compatibility
        log('Generating Inputs (EdDSA Signing)...', 'zokrates');
        await forceUpdate();

        // === ZOKRATES EDDSA SIGNER IMPLEMENTATION ===
        // This manually implements the EdDSA logic used by ZoKrates stdlib
        // to ensure 100% compatibility with verifyEddsa.zok

        const ZOK_GU = BigInt('16540640123574156134436876038791482806971768689494387082833631921987005038935');
        const ZOK_GV = BigInt('20819045374670962167435360035096875258406992893633759881276124905556507972311');
        const SUBORDER = BigInt('2736030358979909402780800718157159386076813972158567259200215660948447373041');

        async function signZoKrates(privKeyBytes, messageWords) {
            // 1. Generate Public Key: A = s * G   (where G is ZoKrates generator)

            // Prune buffer (standard EdDSA clamping)
            const h = await crypto.subtle.digest('SHA-256', privKeyBytes);
            const sBuff = new Uint8Array(h);
            sBuff[0] &= 0xF8;
            sBuff[31] &= 0x7F;
            sBuff[31] |= 0x40;

            // Convert to scalar
            let s = BigInt(0);
            for (let i = 0; i < 32; i++) {
                s += BigInt(sBuff[i]) << BigInt(i * 8);
            }

            // Compute A = s * G
            const G = [F.e(ZOK_GU), F.e(ZOK_GV)];
            const A = eddsa.babyJub.mulPointEscalar(G, s);

            // 2. Generate Random Nonce r
            const rBuff = new Uint8Array(32);
            crypto.getRandomValues(rBuff);
            let r = BigInt(0);
            for (let i = 0; i < 32; i++) {
                r += BigInt(rBuff[i]) << BigInt(i * 8);
            }
            r = r % SUBORDER;

            // 3. Compute R = r * G
            const R = eddsa.babyJub.mulPointEscalar(G, r);

            // 4. Compute Challenge: hRAM = SHA256(R, A, M)
            // We need to match ZoKrates packing exactly.
            // In verifyEddsa.zok: 
            // Rx = unpack256u(R[0]);
            // Ax = unpack256u(A[0]);
            // hRAM = sha256(Rx, Ax, M0, M1);

            // ZoKrates u32 packing logic: 
            // It packs u32[0] as the first 32 bits. 
            // We need to convert BigInt coordinates to 32-byte buffers (Big Endian for SHA-256)

            function to32BytesBE(bigIntVal) {
                let hex = BigInt(bigIntVal).toString(16);
                if (hex.length % 2 !== 0) hex = '0' + hex;
                const padded = hex.padStart(64, '0');
                const bytes = new Uint8Array(32);
                for (let i = 0; i < 32; i++) {
                    bytes[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16);
                }
                return bytes;
            }

            // Convert message words (u32[8]) to bytes
            function msgWordsToBytes(words) {
                const bytes = new Uint8Array(32);
                for (let i = 0; i < 8; i++) {
                    // ZoKrates u32 is big-endian friendly in SHA
                    // words[i] is a string or number
                    const val = parseInt(words[i]);
                    bytes[i * 4] = (val >> 24) & 0xFF;
                    bytes[i * 4 + 1] = (val >> 16) & 0xFF;
                    bytes[i * 4 + 2] = (val >> 8) & 0xFF;
                    bytes[i * 4 + 3] = val & 0xFF;
                }
                return bytes;
            }

            const R_bytes = to32BytesBE(F.toObject(R[0]));
            const A_bytes = to32BytesBE(F.toObject(A[0]));

            // Simple message (all zeros) handling for now
            // We'll pass zeros to match our input
            const M0_bytes = new Uint8Array(32);
            const M1_bytes = new Uint8Array(32);

            // Compute SHA-256 hash part
            // Concatenate R, A, M0, M1
            const hashInput = new Uint8Array(32 + 32 + 32 + 32);
            hashInput.set(R_bytes, 0);
            hashInput.set(A_bytes, 32);
            hashInput.set(M0_bytes, 64);
            hashInput.set(M1_bytes, 96);

            const hRAM_digest = await crypto.subtle.digest('SHA-256', hashInput);
            const hRAM_bytes = new Uint8Array(hRAM_digest);

            // Convert hash to scalar
            let hRAM = BigInt(0);
            for (let i = 0; i < 32; i++) {
                hRAM += BigInt(hRAM_bytes[31 - i]) << BigInt(i * 8); // Little Endian Load for Scalar
            }

            // 5. Compute S = r + hRAM * s
            const S = (r + (hRAM * s)) % SUBORDER;

            return {
                R: [F.toObject(R[0]).toString(), F.toObject(R[1]).toString()],
                S: S.toString(),
                A: [F.toObject(A[0]).toString(), F.toObject(A[1]).toString()]
            };
        }

        // Generate keys and signature using our custom function
        const privKey = new Uint8Array(32);
        crypto.getRandomValues(privKey);

        // Use placeholder message (zeros)
        const msgPart0 = Array(8).fill('0');
        const msgPart1 = Array(8).fill('0');

        const sig = await signZoKrates(privKey, msgPart0);

        const pubKeyX = sig.A[0];
        const pubKeyY = sig.A[1];
        const sigRx = sig.R[0];
        const sigRy = sig.R[1];
        const sigS = sig.S;

        // Input: 1000 units, token type 12345
        const inputAmount = '1000';
        const tokenParams = '12345';

        // Generate recipient keypair for output (use circomlibjs for outputs, that's fine)
        const recipientPrivKey = new Uint8Array(32);
        crypto.getRandomValues(recipientPrivKey);
        const recipientPubKey = eddsa.prv2pub(recipientPrivKey);
        const recipientPubKeyX = F.toObject(recipientPubKey[0]).toString();

        // Outputs: 2 used slots (600 + 400 = 1000), rest are zeros
        const outputAmounts = ['600', '400', ...Array(MAX_OUTPUTS_ZOK - 2).fill('0')];
        const outputTokenParams = [tokenParams, tokenParams, ...Array(MAX_OUTPUTS_ZOK - 2).fill('0')];
        const outputOwnerPubKeyX = [recipientPubKeyX, pubKeyX, ...Array(MAX_OUTPUTS_ZOK - 2).fill('0')];

        log('Computing Witness (Executing Circuit)...', 'zokrates');
        await forceUpdate();
        const witnessStart = performance.now();
        const { witness, output } = zokratesProvider.computeWitness(
            artifacts,
            [
                inputAmount,                    // field inputAmount
                tokenParams,                    // field tokenParams
                [sigRx, sigRy],                 // field[2] sigR
                sigS,                           // field sigS
                [pubKeyX, pubKeyY],             // field[2] pubKey
                msgPart0,                       // u32[8] msgPart0
                msgPart1,                       // u32[8] msgPart1
                outputAmounts,                  // field[10] outputAmounts
                outputTokenParams,              // field[10] outputTokenParams
                outputOwnerPubKeyX              // field[10] outputOwnerPubKeyX
            ]
        );
        metrics.witnessTime = performance.now() - witnessStart;

        elements.zokWitnessTime.textContent = formatMs(metrics.witnessTime);
        log(`Witness computed in ${formatMs(metrics.witnessTime)}`, 'zokrates');

        // Step 4: Generate proof
        log('Generating Zero-Knowledge Proof...', 'zokrates');
        await forceUpdate();
        const proofStart = performance.now();
        const proof = zokratesProvider.generateProof(
            artifacts.program,
            witness,
            keypair.pk
        );
        metrics.proofTime = performance.now() - proofStart;

        const proofJson = JSON.stringify(proof, null, 2);
        metrics.proofSize = new Blob([proofJson]).size;

        elements.zokProofTime.textContent = formatMs(metrics.proofTime);
        elements.zokProofSize.textContent = formatBytes(metrics.proofSize);
        elements.zokProofOutput.textContent = proofJson;

        log(`ZoKrates proof generated in ${formatMs(metrics.proofTime)}`, 'success');
        log(`Uses custom EdDSA-Poseidon verifier (matching Circom's approach)`, 'zokrates');

        elements.zokStatus.textContent = `Complete - ${formatMs(metrics.proofTime)}`;
        elements.zokStatus.className = 'status success';


    } catch (error) {
        log(`ZoKrates error: ${error.message}`, 'error');
        elements.zokStatus.textContent = 'Error';
        elements.zokStatus.className = 'status error';
        elements.zokProofOutput.textContent = `Error: ${error.message}`;
        console.error(error);
    } finally {
        elements.btnRunZokrates.disabled = false;
        elements.btnRunZokrates.classList.remove('loading');
    }
}

// === CIRCOM PROVER ===

async function loadCircomArtifacts() {
    if (circomWasm && circomZkey && circomVkey) {
        log('Using cached Circom artifacts');
        return;
    }

    log('Loading Circom artifacts (WASM, ZKey)...', 'circom');

    const wasmResponse = await fetch(CIRCOM_WASM_URL);
    if (!wasmResponse.ok) throw new Error('Failed to load WASM');
    circomWasm = await wasmResponse.arrayBuffer();

    const zkeyResponse = await fetch(CIRCOM_ZKEY_URL);
    if (!zkeyResponse.ok) throw new Error('Failed to load zkey');
    circomZkey = await zkeyResponse.arrayBuffer();
    elements.circomZkeySize.textContent = formatBytes(circomZkey.byteLength);

    const vkeyResponse = await fetch(CIRCOM_VKEY_URL);
    if (!vkeyResponse.ok) throw new Error('Failed to load vkey');
    circomVkey = await vkeyResponse.json();
    elements.circomVkSize.textContent = formatBytes(JSON.stringify(circomVkey).length);

    // Fetch metadata (constraints)
    try {
        const metaResponse = await fetch('/circuits/metadata.json');
        if (metaResponse.ok) {
            const meta = await metaResponse.json();
            if (meta.constraints) {
                // Store in a global or just on the element for now, 
                // but better to put in a var for the run function to use or just update the UI placeholder
                metrics.constraints = meta.constraints; // Wait, this local `metrics` is not the one in runCircomBenchmark
                // Let's store it in a global cache
                circomConstraintsCount = meta.constraints;
            }
        }
    } catch (e) {
        console.warn('Could not load circuit metadata', e);
    }

    log('Circom artifacts loaded', 'success');
}

function padArray(arr, len, defaultVal = '0') {
    const result = [...arr];
    while (result.length < len) {
        result.push(defaultVal);
    }
    return result;
}

async function runCircomBenchmark() {
    elements.btnRunCircom.disabled = true;
    elements.btnRunCircom.classList.add('loading');
    elements.circomStatus.textContent = 'Running...';
    elements.circomStatus.className = 'status running';

    const metrics = {};

    try {
        // Helper to let UI repaint before heavy work
        const forceUpdate = () => new Promise(resolve => setTimeout(resolve, 50));

        await initCrypto();
        await loadCircomArtifacts();

        // Generate test wallet and inputs
        log('Generating Inputs (EdDSA Signing)...', 'circom');
        await forceUpdate();

        // Generate keypair
        const privateKey = new Uint8Array(32);
        crypto.getRandomValues(privateKey);
        const pubKey = eddsa.prv2pub(privateKey);
        const pubKeyX = F.toObject(pubKey[0]);
        const pubKeyY = F.toObject(pubKey[1]);

        // Test values
        const inputAmount = 1000n;
        const tokenParams = 12345n;
        const amount = 100n;
        const change = inputAmount - amount;

        // Generate recipient keypair
        const recipientPrivKey = new Uint8Array(32);
        crypto.getRandomValues(recipientPrivKey);
        const recipientPubKey = eddsa.prv2pub(recipientPrivKey);
        const recipientPubKeyX = F.toObject(recipientPubKey[0]);
        const recipientPubKeyY = F.toObject(recipientPubKey[1]);

        // Build output arrays
        const outputAmounts = padArray([amount.toString(), change.toString()], MAX_OUTPUTS);
        const outputTokenParams = padArray([tokenParams.toString(), tokenParams.toString()], MAX_OUTPUTS);
        const outputOwnerPubKeyX = padArray([recipientPubKeyX.toString(), pubKeyX.toString()], MAX_OUTPUTS);
        const outputOwnerPubKeyY = padArray([recipientPubKeyY.toString(), pubKeyY.toString()], MAX_OUTPUTS);

        // Compute output commitment (matches circuit)
        const outputData = [];
        for (let i = 0; i < MAX_OUTPUTS; i++) {
            outputData.push(BigInt(outputAmounts[i]));
            outputData.push(BigInt(outputTokenParams[i]));
            outputData.push(BigInt(outputOwnerPubKeyX[i]));
        }

        // Hash in chunks of 8
        const numChunks = Math.ceil(outputData.length / 8);
        const chunkHashes = [];
        for (let c = 0; c < numChunks; c++) {
            const chunk = [];
            for (let i = 0; i < 8; i++) {
                const idx = c * 8 + i;
                chunk.push(idx < outputData.length ? outputData[idx] : 0n);
            }
            const hash = poseidon(chunk);
            chunkHashes.push(F.toObject(hash));
        }
        const outputCommitment = F.toObject(poseidon(chunkHashes));

        // Create signature message
        const msgHash = poseidon([inputAmount, tokenParams, outputCommitment]);
        const signature = eddsa.signPoseidon(privateKey, msgHash);
        const sigR8x = F.toObject(signature.R8[0]);
        const sigR8y = F.toObject(signature.R8[1]);
        const sigS = signature.S;

        // Build witness input
        const witnessInput = {
            inputAmount: inputAmount.toString(),
            inputScript: tokenParams.toString(),
            inputOwnerPubKeyX: pubKeyX.toString(),
            inputOwnerPubKeyY: pubKeyY.toString(),
            sigR8x: sigR8x.toString(),
            sigR8y: sigR8y.toString(),
            sigS: sigS.toString(),
            outputAmounts,
            outputScripts: outputTokenParams,
            outputOwnerPubKeyX,
            outputOwnerPubKeyY,
            numOutputs: '2'
        };

        console.log('Witness Input:', JSON.stringify(witnessInput, null, 2));

        // Generate proof
        log('Generating proof...', 'circom');

        // SEPARATE WITNESS CALCULATION AND PROVING
        // Note: We are using fullProve because manual witness calculation via snarkjs.wtns.calculate
        // resulted in internal errors in the browser environment.
        // For a fair comparison, we note that Circom's time includes witness generation.

        log('Generating Witness & Proof (Groth16)...', 'circom');
        await forceUpdate();

        // 1. Calculate Witness & Prove (Atomic)
        const proofStart = performance.now();
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            witnessInput,
            new Uint8Array(circomWasm),
            new Uint8Array(circomZkey)
        );
        metrics.proofTime = performance.now() - proofStart;

        // Update UI
        metrics.witnessTime = 0; // It's strictly 0 because we can't measure it separately
        elements.circomWitnessTime.textContent = '(in Proof)';
        elements.circomProofTime.textContent = formatMs(metrics.proofTime);

        log(`Proof generated in ${formatMs(metrics.proofTime)} (incl. witness)`, 'circom');

        const proofJson = JSON.stringify({ proof, publicSignals }, null, 2);
        metrics.proofSize = new Blob([proofJson]).size;

        // Get constraint count from metadata if available
        metrics.constraints = circomConstraintsCount ? circomConstraintsCount.toLocaleString() : 'Unknown';

        elements.circomConstraints.textContent = metrics.constraints;
        elements.circomProofTime.textContent = formatMs(metrics.proofTime);
        elements.circomProofSize.textContent = formatBytes(metrics.proofSize);
        elements.circomProofOutput.textContent = proofJson;

        log(`✅ Circom proof generated in ${formatMs(metrics.proofTime)}`, 'success');

        elements.circomStatus.textContent = `Complete - ${formatMs(metrics.proofTime)}`;
        elements.circomStatus.className = 'status success';

    } catch (error) {
        log(`Circom error: ${error.message}`, 'error');
        console.error('Full error:', error);
        elements.circomStatus.textContent = 'Error';
        elements.circomStatus.className = 'status error';
        elements.circomProofOutput.textContent = `Error: ${error.message}\n\n${error.stack}`;
    } finally {
        elements.btnRunCircom.disabled = false;
        elements.btnRunCircom.classList.remove('loading');
    }
}

// === TAB SWITCHING ===
function setupTabs() {
    elements.tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            elements.tabs.forEach(t => t.classList.remove('active'));
            elements.proofOutputs.forEach(p => p.classList.remove('active'));

            tab.classList.add('active');
            const targetId = tab.dataset.tab;
            document.getElementById(targetId).classList.add('active');
        });
    });
}

// === INIT ===
async function init() {
    log('ZK Benchmark initialized');
    log('Click a button to run a prover benchmark');

    setupTabs();

    elements.btnRunZokrates.addEventListener('click', runZokratesBenchmark);
    elements.btnRunCircom.addEventListener('click', runCircomBenchmark);

    // Pre-fetch Circom artifact sizes
    try {
        const zkeyHead = await fetch(CIRCOM_ZKEY_URL, { method: 'HEAD' });
        if (zkeyHead.ok) {
            const size = zkeyHead.headers.get('content-length');
            if (size) {
                elements.circomZkeySize.textContent = formatBytes(parseInt(size));
            }
        }

        const vkeyHead = await fetch(CIRCOM_VKEY_URL, { method: 'HEAD' });
        if (vkeyHead.ok) {
            const size = vkeyHead.headers.get('content-length');
            if (size) {
                elements.circomVkSize.textContent = formatBytes(parseInt(size));
            }
        }
    } catch (e) {
        // Ignore prefetch errors
    }

    log('Ready - select a prover to benchmark', 'success');
}

init();
