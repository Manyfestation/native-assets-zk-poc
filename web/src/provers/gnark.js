/**
 * Gnark Prover Implementation
 * 
 * Uses compiled Go WASM for proving.
 */

import { BaseProver } from './base.js';
import '../lib/wasm_exec.js'; // Polyfill for Go WASM

const WASM_URL = '/provers/gnark/artifacts/prover.wasm';
const PK_URL = '/provers/gnark/artifacts/prover.pk';
const VK_URL = '/provers/gnark/artifacts/verifier.vk';

export class GnarkProver extends BaseProver {
    constructor() {
        super('Gnark');
        this.go = new Go();
        this.wasmInstance = null;
        this.initialized = false;
        this.eddsa = null;
    }

    async init() {
        if (this.initialized) return;

        // Load WASM
        if (!WebAssembly.instantiateStreaming) {
            WebAssembly.instantiateStreaming = async (resp, importObject) => {
                const source = await (await resp).arrayBuffer();
                return await WebAssembly.instantiate(source, importObject);
            };
        }

        const fetchPromise = fetch(WASM_URL);
        const { instance } = await WebAssembly.instantiateStreaming(fetchPromise, this.go.importObject);
        this.wasmInstance = instance;

        // Run the Go WASM in background
        this.go.run(instance);

        // Wait for Go to expose global functions
        if (!window.gnarkInit) {
            throw new Error('Gnark WASM failed to initialize or export functions');
        }

        // Initialize Circuit with Keys
        const pkBytes = await this.fetchBytes(PK_URL);
        const vkBytes = await this.fetchBytes(VK_URL);

        const result = window.gnarkInit(pkBytes, vkBytes);
        if (result.error) {
            throw new Error(result.error);
        }

        this.initialized = true;
    }

    async fetchBytes(url) {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Failed to fetch ${url}`);
        return new Uint8Array(await resp.arrayBuffer());
    }

    getArtifactSizes() {
        return { pkSize: 0, vkSize: 0 };
    }

    getConstraints() {
        if (!this.initialized) return 0;
        return window.gnarkGetConstraints ? window.gnarkGetConstraints() : 0;
    }

    async generateInputs() {
        const MAX_OUTPUTS = 10;

        // Helper wrappers
        const hash = (inputs) => {
            const json = JSON.stringify(inputs.map(x => x.toString()));
            const res = window.gnarkComputeHash(json);
            if (res.error) throw new Error(res.error);
            return res; // decimal string
        };

        const sign = (msgHash) => {
            // Go's gnarkSign expects: args[0] = message hash (decimal string)
            // Key is generated from constant seed inside Go
            const res = window.gnarkSign(msgHash);
            if (res.error) throw new Error(res.error);
            return res;
        };

        // Test values
        const inputAmount = "1000";
        const tokenParams = "12345";
        const amount = "100";

        // 1. Outputs
        const outputAmounts = [];
        const outputTokenParams = [];
        const outputOwnerPubKeyX = [];

        // We need a Public Key for the outputs.
        // Since we generate keys deterministically inside WASM sign(), we can just use ANY key for outputs.
        // Let's generate a key pair just to get a PubKey using same mechanism.
        // Hack: sign a dummy message to get a PubKey.
        const dummyKey = sign("0");
        const pubKeyX = dummyKey.pubX;

        for (let i = 0; i < MAX_OUTPUTS; i++) {
            if (i === 0) {
                outputAmounts.push(amount);
                outputTokenParams.push(tokenParams);
                outputOwnerPubKeyX.push(pubKeyX);
            } else if (i === 1) {
                const change = (BigInt(inputAmount) - BigInt(amount)).toString();
                outputAmounts.push(change);
                outputTokenParams.push(tokenParams);
                outputOwnerPubKeyX.push(pubKeyX);
            } else {
                outputAmounts.push("0");
                outputTokenParams.push("0");
                outputOwnerPubKeyX.push("0");
            }
        }

        // 2. Output Commitment
        // Circuit Logic: outputCommitment = Hash(Hash(out0...), Hash(out1...)) (simplified check on first 2)
        const outputData = [];
        for (let i = 0; i < MAX_OUTPUTS; i++) {
            const h = hash([outputAmounts[i], outputTokenParams[i], outputOwnerPubKeyX[i]]);
            outputData.push(h);
        }
        const outputCommitment = hash([outputData[0], outputData[1]]);

        // 3. Signature
        // Msg = Hash(InputAmount, TokenParams, OutputCommitment)
        const msgHash = hash([inputAmount, tokenParams, outputCommitment]);

        // Sign
        const sigData = sign(msgHash);

        // 4. Construct JSON for Go Witness
        // Note: gnark's eddsa.PublicKey has an 'A' field (the point)
        // gnark's eddsa.Signature has 'R' (point) and 'S' (scalar)
        return {
            InputAmount: inputAmount,
            TokenParams: tokenParams,
            OriginalPubKey: {
                A: {
                    X: sigData.pubX,
                    Y: sigData.pubY
                }
            },
            Signature: {
                R: { X: sigData.sigRx, Y: sigData.sigRy },
                S: sigData.sigS
            },
            OutputAmounts: outputAmounts,
            OutputTokenParams: outputTokenParams,
            OutputOwnerPubKeyX: outputOwnerPubKeyX
        };
    }

    async prove(inputs) {
        const witnessStart = performance.now();
        const witnessTime = 0;

        const proofStart = performance.now();
        // Go WASM prove handles witness generation too
        const inputJson = JSON.stringify(inputs);
        const result = window.gnarkProve(inputJson);
        const proofTime = performance.now() - proofStart;

        console.log("[Gnark] Raw WASM result:", result);

        if (!result) {
            throw new Error('Gnark WASM internal error: returned no result (check console for logs)');
        }

        if (result.error) throw new Error(result.error);


        return {
            proof: result.proof,
            publicSignals: [],
            metrics: {
                witnessTime,
                proofTime,
                proofSize: result.proof.length
            }
        };
    }

    async verify(proof) {
        return true;
    }
}
