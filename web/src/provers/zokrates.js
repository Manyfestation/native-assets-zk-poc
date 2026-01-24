/**
 * ZoKrates Prover Implementation
 * 
 * Uses zokrates-js WASM for compilation and proving.
 * Circuit source is loaded from /provers/zokrates/circuits/token_transfer.zok
 */

import { BaseProver } from './base.js';
import * as circomlibjs from 'circomlibjs';

// Circuit source URL
const CIRCUIT_URL = '/provers/zokrates/circuits/token_transfer.zok';

export class ZokratesProver extends BaseProver {
    constructor() {
        super('ZoKrates');
        this.provider = null;
        this.artifacts = null;
        this.keypair = null;
        this.circuitSource = null;
        this.eddsa = null;
        this.poseidon = null;
        this.F = null;
        this.constraintsCount = 0;
    }

    async init() {
        if (this.initialized) return;

        // Load ZoKrates WASM module
        const module = await import('https://cdn.jsdelivr.net/npm/zokrates-js@1.1.7/+esm');
        this.provider = await module.initialize();

        // Initialize crypto primitives
        this.eddsa = await circomlibjs.buildEddsa();
        this.poseidon = await circomlibjs.buildPoseidon();
        this.F = this.poseidon.F;

        this.initialized = true;
    }

    async loadArtifacts() {
        // Load circuit source
        if (!this.circuitSource) {
            const response = await fetch(CIRCUIT_URL);
            if (!response.ok) throw new Error('Failed to load circuit source');
            this.circuitSource = await response.text();
        }

        // Compile if not cached
        if (!this.artifacts) {
            this.artifacts = this.provider.compile(this.circuitSource);
            this.constraintsCount = this.artifacts.constraintCount;
        }

        // Generate keys if not cached
        if (!this.keypair) {
            this.keypair = this.provider.setup(this.artifacts.program);
        }
    }

    getConstraintsCount() {
        return this.constraintsCount.toLocaleString();
    }

    getArtifactSizes() {
        const pkSize = this.keypair ? new Blob([JSON.stringify(this.keypair.pk)]).size : 0;
        const vkSize = this.keypair ? new Blob([JSON.stringify(this.keypair.vk)]).size : 0;
        return { pkSize, vkSize };
    }

    /**
     * Generate test inputs with ZoKrates-compatible EdDSA signature
     */
    async generateInputs() {
        const MAX_OUTPUTS = 10;

        // ZoKrates curve constants
        const ZOK_GU = BigInt('16540640123574156134436876038791482806971768689494387082833631921987005038935');
        const ZOK_GV = BigInt('20819045374670962167435360035096875258406992893633759881276124905556507972311');
        const SUBORDER = BigInt('2736030358979909402780800718157159386076813972158567259200215660948447373041');

        // Generate private key
        const privKeyBytes = new Uint8Array(32);
        crypto.getRandomValues(privKeyBytes);

        // Prune buffer (EdDSA clamping)
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

        // Compute public key A = s * G
        const G = [this.F.e(ZOK_GU), this.F.e(ZOK_GV)];
        const A = this.eddsa.babyJub.mulPointEscalar(G, s);

        // Generate nonce r
        const rBuff = new Uint8Array(32);
        crypto.getRandomValues(rBuff);
        let r = BigInt(0);
        for (let i = 0; i < 32; i++) {
            r += BigInt(rBuff[i]) << BigInt(i * 8);
        }
        r = r % SUBORDER;

        // Compute R = r * G
        const R = this.eddsa.babyJub.mulPointEscalar(G, r);

        // Helper: BigInt to 32 bytes BE
        const to32BytesBE = (val) => {
            let hex = BigInt(val).toString(16).padStart(64, '0');
            const bytes = new Uint8Array(32);
            for (let i = 0; i < 32; i++) {
                bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
            }
            return bytes;
        };

        // Compute challenge hash
        const R_bytes = to32BytesBE(this.F.toObject(R[0]));
        const A_bytes = to32BytesBE(this.F.toObject(A[0]));
        const M0_bytes = new Uint8Array(32);
        const M1_bytes = new Uint8Array(32);

        const hashInput = new Uint8Array(128);
        hashInput.set(R_bytes, 0);
        hashInput.set(A_bytes, 32);
        hashInput.set(M0_bytes, 64);
        hashInput.set(M1_bytes, 96);

        const hRAM_digest = await crypto.subtle.digest('SHA-256', hashInput);
        const hRAM_bytes = new Uint8Array(hRAM_digest);

        let hRAM = BigInt(0);
        for (let i = 0; i < 32; i++) {
            hRAM += BigInt(hRAM_bytes[31 - i]) << BigInt(i * 8);
        }

        const S = (r + (hRAM * s)) % SUBORDER;

        // Test values
        const inputAmount = '1000';
        const tokenParams = '12345';

        // Recipient keypair
        const recipientPrivKey = new Uint8Array(32);
        crypto.getRandomValues(recipientPrivKey);
        const recipientPubKey = this.eddsa.prv2pub(recipientPrivKey);
        const recipientPubKeyX = this.F.toObject(recipientPubKey[0]).toString();

        const pubKeyX = this.F.toObject(A[0]).toString();
        const pubKeyY = this.F.toObject(A[1]).toString();

        const outputAmounts = ['600', '400', ...Array(MAX_OUTPUTS - 2).fill('0')];
        const outputTokenParams = [tokenParams, tokenParams, ...Array(MAX_OUTPUTS - 2).fill('0')];
        const outputOwnerPubKeyX = [recipientPubKeyX, pubKeyX, ...Array(MAX_OUTPUTS - 2).fill('0')];

        return [
            inputAmount,
            tokenParams,
            [this.F.toObject(R[0]).toString(), this.F.toObject(R[1]).toString()],
            S.toString(),
            [pubKeyX, pubKeyY],
            Array(8).fill('0'),
            Array(8).fill('0'),
            outputAmounts,
            outputTokenParams,
            outputOwnerPubKeyX
        ];
    }

    async prove(inputs) {
        const witnessStart = performance.now();
        const { witness, output } = this.provider.computeWitness(this.artifacts, inputs);
        const witnessTime = performance.now() - witnessStart;

        const proofStart = performance.now();
        const proof = this.provider.generateProof(
            this.artifacts.program,
            witness,
            this.keypair.pk
        );
        const proofTime = performance.now() - proofStart;

        const proofJson = JSON.stringify(proof);

        return {
            proof,
            publicSignals: [],
            metrics: {
                witnessTime,
                proofTime,
                proofSize: new Blob([proofJson]).size
            }
        };
    }

    async verify(proof) {
        return this.provider.verify(this.keypair.vk, proof);
    }
}

export default ZokratesProver;
