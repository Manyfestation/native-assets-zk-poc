pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/eddsaposeidon.circom";

/**
 * Benchmark Circuit - Fair comparison with ZoKrates
 * 
 * Operations:
 * - 1 EdDSA signature verification (most expensive)
 * - 1 Poseidon(3) hash for commitment
 * - 1 Balance check
 * 
 * This should produce ~15-20K constraints, similar to ZoKrates equivalent.
 */
template BenchmarkCircuit() {
    // Private inputs
    signal input amount;
    signal input salt;
    signal input pubKeyX;
    signal input pubKeyY;
    signal input sigR8x;
    signal input sigR8y;
    signal input sigS;
    
    // Public inputs
    signal input commitment;
    signal input expectedAmount;
    
    // 1. Compute commitment = Poseidon(amount, salt, pubKeyX)
    component hash = Poseidon(3);
    hash.inputs[0] <== amount;
    hash.inputs[1] <== salt;
    hash.inputs[2] <== pubKeyX;
    commitment === hash.out;
    
    // 2. Verify EdDSA signature over commitment
    component sigVerify = EdDSAPoseidonVerifier();
    sigVerify.enabled <== 1;
    sigVerify.Ax <== pubKeyX;
    sigVerify.Ay <== pubKeyY;
    sigVerify.R8x <== sigR8x;
    sigVerify.R8y <== sigR8y;
    sigVerify.S <== sigS;
    sigVerify.M <== hash.out;
    
    // 3. Balance check
    expectedAmount === amount;
}

component main {public [commitment, expectedAmount]} = BenchmarkCircuit();
