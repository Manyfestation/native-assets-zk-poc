/**
 * Base Prover Interface
 * 
 * All ZK SDK implementations should follow this pattern.
 */

export class BaseProver {
    constructor(name) {
        this.name = name;
        this.initialized = false;
    }

    /**
     * Initialize the prover (load WASM, libraries, etc.)
     * @returns {Promise<void>}
     */
    async init() {
        throw new Error('Not implemented');
    }

    /**
     * Load pre-compiled artifacts (wasm, keys, etc.)
     * @returns {Promise<void>}
     */
    async loadArtifacts() {
        throw new Error('Not implemented');
    }

    /**
     * Generate a proof for the given inputs
     * @param {Object} inputs - Circuit inputs
     * @returns {Promise<{proof: Object, publicSignals: Array, metrics: Object}>}
     */
    async prove(inputs) {
        throw new Error('Not implemented');
    }

    /**
     * Verify a proof
     * @param {Object} proof
     * @param {Array} publicSignals
     * @returns {Promise<boolean>}
     */
    async verify(proof, publicSignals) {
        throw new Error('Not implemented');
    }

    /**
     * Get circuit constraints count
     * @returns {number|string}
     */
    getConstraintsCount() {
        return 'Unknown';
    }

    /**
     * Get artifact sizes
     * @returns {Object} - {wasmSize, pkSize, vkSize}
     */
    getArtifactSizes() {
        return { wasmSize: 0, pkSize: 0, vkSize: 0 };
    }
}

export default BaseProver;
