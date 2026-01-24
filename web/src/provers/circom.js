/**
 * Circom Prover Implementation
 * 
 * Uses snarkjs for Groth16 proofs with pre-compiled artifacts.
 */

import { BaseProver } from './base.js';
import * as circomlibjs from 'circomlibjs';

// Artifacts are served from /provers/circom/
const ARTIFACTS_BASE = '/provers/circom';
const WASM_URL = `${ARTIFACTS_BASE}/token_transfer.wasm`;
const ZKEY_URL = `${ARTIFACTS_BASE}/token_transfer.zkey`;
const VKEY_URL = `${ARTIFACTS_BASE}/verification_key.json`;

export class CircomProver extends BaseProver {
    constructor() {
        super('Circom');
        this.wasm = null;
        this.zkey = null;
        this.vkey = null;
        this.eddsa = null;
        this.poseidon = null;
        this.F = null;
        this.constraintsCount = 14281; // Pre-compiled count
    }

    async init() {
        if (this.initialized) return;

        // Initialize crypto primitives
        this.eddsa = await circomlibjs.buildEddsa();
        this.poseidon = await circomlibjs.buildPoseidon();
        this.F = this.poseidon.F;

        this.initialized = true;
    }

    async loadArtifacts() {
        if (this.wasm && this.zkey && this.vkey) return;

        const [wasmRes, zkeyRes, vkeyRes] = await Promise.all([
            fetch(WASM_URL),
            fetch(ZKEY_URL),
            fetch(VKEY_URL)
        ]);

        if (!wasmRes.ok) throw new Error('Failed to load WASM');
        if (!zkeyRes.ok) throw new Error('Failed to load zkey');
        if (!vkeyRes.ok) throw new Error('Failed to load vkey');

        this.wasm = await wasmRes.arrayBuffer();
        this.zkey = await zkeyRes.arrayBuffer();
        this.vkey = await vkeyRes.json();
    }

    getConstraintsCount() {
        return this.constraintsCount.toLocaleString();
    }

    getArtifactSizes() {
        return {
            wasmSize: this.wasm?.byteLength || 0,
            zkeySize: this.zkey?.byteLength || 0,
            vkeySize: this.vkey ? JSON.stringify(this.vkey).length : 0
        };
    }

    /**
     * Generate test inputs with EdDSA signature
     */
    async generateInputs() {
        const MAX_OUTPUTS = 10;

        // Generate keypair
        const privateKey = new Uint8Array(32);
        crypto.getRandomValues(privateKey);
        const pubKey = this.eddsa.prv2pub(privateKey);
        const pubKeyX = this.F.toObject(pubKey[0]);
        const pubKeyY = this.F.toObject(pubKey[1]);

        // Test values
        const inputAmount = 1000n;
        const tokenParams = 12345n;
        const amount = 100n;
        const change = inputAmount - amount;

        // Recipient keypair
        const recipientPrivKey = new Uint8Array(32);
        crypto.getRandomValues(recipientPrivKey);
        const recipientPubKey = this.eddsa.prv2pub(recipientPrivKey);
        const recipientPubKeyX = this.F.toObject(recipientPubKey[0]);
        const recipientPubKeyY = this.F.toObject(recipientPubKey[1]);

        // Pad arrays
        const pad = (arr, len, def = '0') => {
            const result = [...arr];
            while (result.length < len) result.push(def);
            return result;
        };

        const outputAmounts = pad([amount.toString(), change.toString()], MAX_OUTPUTS);
        const outputScripts = pad([tokenParams.toString(), tokenParams.toString()], MAX_OUTPUTS);
        const outputOwnerPubKeyX = pad([recipientPubKeyX.toString(), pubKeyX.toString()], MAX_OUTPUTS);
        const outputOwnerPubKeyY = pad([recipientPubKeyY.toString(), pubKeyY.toString()], MAX_OUTPUTS);

        // Compute output commitment
        const outputData = [];
        for (let i = 0; i < MAX_OUTPUTS; i++) {
            outputData.push(BigInt(outputAmounts[i]));
            outputData.push(BigInt(outputScripts[i]));
            outputData.push(BigInt(outputOwnerPubKeyX[i]));
        }

        const numChunks = Math.ceil(outputData.length / 8);
        const chunkHashes = [];
        for (let c = 0; c < numChunks; c++) {
            const chunk = [];
            for (let i = 0; i < 8; i++) {
                const idx = c * 8 + i;
                chunk.push(idx < outputData.length ? outputData[idx] : 0n);
            }
            chunkHashes.push(this.F.toObject(this.poseidon(chunk)));
        }
        const outputCommitment = this.F.toObject(this.poseidon(chunkHashes));

        // Sign message
        const msgHash = this.poseidon([inputAmount, tokenParams, outputCommitment]);
        const signature = this.eddsa.signPoseidon(privateKey, msgHash);

        return {
            inputAmount: inputAmount.toString(),
            inputScript: tokenParams.toString(),
            inputOwnerPubKeyX: pubKeyX.toString(),
            inputOwnerPubKeyY: pubKeyY.toString(),
            sigR8x: this.F.toObject(signature.R8[0]).toString(),
            sigR8y: this.F.toObject(signature.R8[1]).toString(),
            sigS: signature.S.toString(),
            outputAmounts,
            outputScripts,
            outputOwnerPubKeyX,
            outputOwnerPubKeyY,
            numOutputs: '2'
        };
    }

    async prove(inputs) {
        const snarkjs = window.snarkjs;

        const proofStart = performance.now();
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            inputs,
            new Uint8Array(this.wasm),
            new Uint8Array(this.zkey)
        );
        const proofTime = performance.now() - proofStart;

        const proofJson = JSON.stringify({ proof, publicSignals });

        return {
            proof,
            publicSignals,
            metrics: {
                proofTime,
                proofSize: new Blob([proofJson]).size
            }
        };
    }

    async verify(proof, publicSignals) {
        const snarkjs = window.snarkjs;
        return await snarkjs.groth16.verify(this.vkey, publicSignals, proof);
    }
}

export default CircomProver;
