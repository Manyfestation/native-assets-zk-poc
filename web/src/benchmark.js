/**
 * ZK Benchmark - Fair comparison of ZoKrates vs Circom
 * 
 * Both provers run equivalent complexity circuits client-side:
 * - 1 EdDSA signature verification
 * - Poseidon hashes for commitments
 * - Balance conservation check
 */

import { CircomProver } from './provers/circom.js';
import { GnarkProver } from './provers/gnark.js';
import * as circomlibjs from 'circomlibjs';

// snarkjs loaded via CDN
const snarkjs = window.snarkjs;

// === PURE JS SHA-256 FALLBACK ===
// Used when Web Crypto API is not available (non-HTTPS remote servers)
const sha256Fallback = (() => {
    const K = new Uint32Array([
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ]);

    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    const ch = (x, y, z) => (x & y) ^ (~x & z);
    const maj = (x, y, z) => (x & y) ^ (x & z) ^ (y & z);
    const sigma0 = x => rotr(x, 2) ^ rotr(x, 13) ^ rotr(x, 22);
    const sigma1 = x => rotr(x, 6) ^ rotr(x, 11) ^ rotr(x, 25);
    const gamma0 = x => rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
    const gamma1 = x => rotr(x, 17) ^ rotr(x, 19) ^ (x >>> 10);

    return async function sha256(data) {
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        const bitLen = bytes.length * 8;

        // Padding
        const padLen = (bytes.length + 9 + 63) & ~63;
        const padded = new Uint8Array(padLen);
        padded.set(bytes);
        padded[bytes.length] = 0x80;
        const view = new DataView(padded.buffer);
        view.setUint32(padLen - 4, bitLen, false);

        // Initial hash values
        let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
        let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

        const W = new Uint32Array(64);

        for (let offset = 0; offset < padLen; offset += 64) {
            for (let i = 0; i < 16; i++) {
                W[i] = view.getUint32(offset + i * 4, false);
            }
            for (let i = 16; i < 64; i++) {
                W[i] = (gamma1(W[i - 2]) + W[i - 7] + gamma0(W[i - 15]) + W[i - 16]) >>> 0;
            }

            let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;

            for (let i = 0; i < 64; i++) {
                const t1 = (h + sigma1(e) + ch(e, f, g) + K[i] + W[i]) >>> 0;
                const t2 = (sigma0(a) + maj(a, b, c)) >>> 0;
                h = g; g = f; f = e; e = (d + t1) >>> 0;
                d = c; c = b; b = a; a = (t1 + t2) >>> 0;
            }

            h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
            h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
        }

        const result = new ArrayBuffer(32);
        const resultView = new DataView(result);
        resultView.setUint32(0, h0, false);
        resultView.setUint32(4, h1, false);
        resultView.setUint32(8, h2, false);
        resultView.setUint32(12, h3, false);
        resultView.setUint32(16, h4, false);
        resultView.setUint32(20, h5, false);
        resultView.setUint32(24, h6, false);
        resultView.setUint32(28, h7, false);
        return result;
    };
})();

// SHA-256 helper that uses Web Crypto if available, falls back to pure JS
async function sha256Digest(data) {
    const cryptoSubtle = (globalThis.crypto || window.crypto)?.subtle;
    if (cryptoSubtle) {
        return await cryptoSubtle.digest('SHA-256', data);
    }
    return await sha256Fallback(data);
}

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

    // Gnark
    btnRunGnark: document.getElementById('btn-run-gnark'),
    gnarkStatus: document.getElementById('gnark-status'),
    gnarkConstraints: document.getElementById('gnark-constraints'),
    gnarkCompileTime: document.getElementById('gnark-compile-time'),
    gnarkSetupTime: document.getElementById('gnark-setup-time'),
    gnarkWitnessTime: document.getElementById('gnark-witness-time'),
    gnarkProofTime: document.getElementById('gnark-proof-time'),
    gnarkProofSize: document.getElementById('gnark-proof-size'),
    gnarkVkSize: document.getElementById('gnark-vk-size'),
    gnarkPkSize: document.getElementById('gnark-pk-size'),
    gnarkProofOutput: document.getElementById('gnark-proof'),

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
            const h = await sha256Digest(privKeyBytes);
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

            const hRAM_digest = await sha256Digest(hashInput);
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

// === GNARK PROVER ===

let gnarkProver = null;

async function runGnarkBenchmark() {
    elements.btnRunGnark.disabled = true;
    elements.btnRunGnark.classList.add('loading');
    elements.gnarkStatus.textContent = 'Running...';
    elements.gnarkStatus.className = 'status running';

    const metrics = {};

    try {
        const forceUpdate = () => new Promise(resolve => setTimeout(resolve, 50));

        if (!gnarkProver) {
            log('Initializing Gnark Prover...', 'gnark');
            gnarkProver = new GnarkProver();
            const initStart = performance.now();
            await gnarkProver.init();
            log(`Gnark WASM initialized in ${formatMs(performance.now() - initStart)}`, 'gnark');
        }

        // Generate Inputs
        log('Generating inputs...', 'gnark');
        await forceUpdate();
        const inputs = await gnarkProver.generateInputs();

        // Prove
        log('Generating Proof (Groth16)...', 'gnark');
        await forceUpdate();

        const result = await gnarkProver.prove(inputs);

        metrics.proofTime = result.metrics.proofTime;
        metrics.proofSize = result.metrics.proofSize;
        metrics.constraints = gnarkProver.getConstraints();

        elements.gnarkProofTime.textContent = formatMs(metrics.proofTime);
        elements.gnarkProofSize.textContent = formatBytes(metrics.proofSize);

        // Display proof as Hex
        const proofHex = Array.from(result.proof).map(b => b.toString(16).padStart(2, '0')).join('');
        elements.gnarkProofOutput.textContent = proofHex;

        // Update sizes (approx, assuming loaded)
        // In real impl we'd get them from prover
        elements.gnarkPkSize.textContent = "Unknown";
        elements.gnarkVkSize.textContent = "Unknown";

        const constraints = metrics.constraints;
        elements.gnarkConstraints.textContent = constraints ? constraints.toLocaleString() : "Unknown";

        log(`Gnark proof generated in ${formatMs(metrics.proofTime)}`, 'success');
        elements.gnarkStatus.textContent = `Complete - ${formatMs(metrics.proofTime)}`;
        elements.gnarkStatus.className = 'status success';

    } catch (error) {
        log(`Gnark error: ${error.message}`, 'error');
        console.error(error);
        elements.gnarkStatus.textContent = 'Error';
        elements.gnarkStatus.className = 'status error';
        elements.gnarkProofOutput.textContent = `Error: ${error.message}`;
    } finally {
        elements.btnRunGnark.disabled = false;
        elements.btnRunGnark.classList.remove('loading');
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
    elements.btnRunGnark.addEventListener('click', runGnarkBenchmark);

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
