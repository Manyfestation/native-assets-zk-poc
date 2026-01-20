pragma circom 2.0.0;

include "../../circuits/node_modules/circomlib/circuits/comparators.circom";
include "../../circuits/node_modules/circomlib/circuits/poseidon.circom";
include "../../circuits/node_modules/circomlib/circuits/eddsaposeidon.circom";

///// Helper utils

// Checks equality of two fields
template FieldEqual() {
    signal input a;
    signal input b;
    signal output out;
    
    component eq = IsEqual();
    eq.in[0] <== a;
    eq.in[1] <== b;
    out <== eq.out;
}

// Hash arbitrary length array using Poseidon by breaking it into chunks of 8
template HashArray(n) {
    signal input values[n];
    signal output out;
    
    var numChunks = (n + 7) \ 8;
    component chunkHash[numChunks];
    signal chunkOuts[numChunks];
    
    for (var c = 0; c < numChunks; c++) {
        chunkHash[c] = Poseidon(8);
        for (var i = 0; i < 8; i++) {
            var idx = c * 8 + i;
            if (idx < n) {
                chunkHash[c].inputs[i] <== values[idx];
            } else {
                chunkHash[c].inputs[i] <== 0;
            }
        }
        chunkOuts[c] <== chunkHash[c].out;
    }
    
    component finalHash = Poseidon(numChunks);
    for (var c = 0; c < numChunks; c++) {
        finalHash.inputs[c] <== chunkOuts[c];
    }
    
    out <== finalHash.out;
}

// NATIVE ASSET PROOF
// Single input UTXO being spent to multiple outputs.
// 
// 1. BALANCE CONSERVATION: inputAmount == sum(outputAmounts)
// 2. SCRIPT PRESERVATION: all outputs have same script as input
// 3. OWNER AUTHORIZATION: valid EdDSA signature from input owner
template NativeAssetProof(maxOutputs) {
    // Private inputs
    // Single utxo input - amount and script
    signal input inputAmount;
    signal input inputScript;  // Token type / script hash

    // Spender public key (2 params in EdDSA)
    signal input inputOwnerPubKeyX; 
    signal input inputOwnerPubKeyY;
    
    // Spender signature (3 params in EdDSA)
    signal input sigR8x;
    signal input sigR8y;
    signal input sigS;

    // Multiple outputs - amount, script, owner pub key
    signal input outputAmounts[maxOutputs];
    signal input outputScripts[maxOutputs];  // Must match input script
    signal input outputOwnerPubKeyX[maxOutputs];
    signal input outputOwnerPubKeyY[maxOutputs];
    signal input numOutputs;  // How many outputs are active (rest are padding)
    
    // Public output
    signal output outputCommitment; 
    
    // 1. Balance check: inputAmount === sum(outputAmounts)
    signal outSum[maxOutputs + 1];
    outSum[0] <== 0;
    
    for (var i = 0; i < maxOutputs; i++) {
        outSum[i + 1] <== outSum[i] + outputAmounts[i];
    }
    
    inputAmount === outSum[maxOutputs];
    
    // 2. Script preservation: all active outputs must match input script
    component scriptMatch[maxOutputs];
    component isActive[maxOutputs];
    
    for (var i = 0; i < maxOutputs; i++) {
        scriptMatch[i] = FieldEqual();
        scriptMatch[i].a <== outputScripts[i];
        scriptMatch[i].b <== inputScript;
        
        isActive[i] = LessThan(8);
        isActive[i].in[0] <== i;
        isActive[i].in[1] <== numOutputs;
        
        // If active, script MUST match (constraint fails otherwise)
        isActive[i].out * (1 - scriptMatch[i].out) === 0;
    }
    
    // 3. Output commitment: hash all outputs for binding
    signal outputData[maxOutputs * 3];
    for (var i = 0; i < maxOutputs; i++) {
        outputData[i * 3] <== outputAmounts[i];
        outputData[i * 3 + 1] <== outputScripts[i];
        outputData[i * 3 + 2] <== outputOwnerPubKeyX[i];
    }
    
    component outCommit = HashArray(maxOutputs * 3);
    for (var i = 0; i < maxOutputs * 3; i++) {
        outCommit.values[i] <== outputData[i];
    }
    outputCommitment <== outCommit.out;
    
    // 4. Signature verification: owner authorizes this spend
    // Message = Poseidon(inputAmount, inputScript, outputCommitment)
    component sigMsg = Poseidon(3);
    sigMsg.inputs[0] <== inputAmount;
    sigMsg.inputs[1] <== inputScript;
    sigMsg.inputs[2] <== outputCommitment;
    
    component sigVerify = EdDSAPoseidonVerifier();
    sigVerify.enabled <== 1;
    sigVerify.Ax <== inputOwnerPubKeyX;
    sigVerify.Ay <== inputOwnerPubKeyY;
    sigVerify.R8x <== sigR8x;
    sigVerify.R8y <== sigR8y;
    sigVerify.S <== sigS;
    sigVerify.M <== sigMsg.out;
}

component main {public [inputAmount, outputAmounts]} = NativeAssetProof(10);
