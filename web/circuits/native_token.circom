pragma circom 2.0.0;

include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/eddsaposeidon.circom";

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

// Single input UTXO being spent to multiple outputs.
// 
// 1. balance conservation: inputAmount == sum(outputAmounts)
// 2. token data preservation: all outputs have same token params
// 3. authorization: valid EdDSA signature 
template TokenTransferProof(maxOutputs) {
    // Private inputs
    // Single utxo input - amount and token params
    signal input inputAmount;
    signal input inputScript;  // Token covenant/Script with parameters

    // Spender public key (2 params in EdDSA)
    signal input inputOwnerPubKeyX; 
    signal input inputOwnerPubKeyY;
    
    // Spender signature (3 params in EdDSA)
    signal input sigR8x;
    signal input sigR8y;
    signal input sigS;

    // Multiple outputs - amount, token params, owner pub key
    signal input outputAmounts[maxOutputs];
    signal input outputScripts[maxOutputs];  // Must match input token params
    signal input outputOwnerPubKeyX[maxOutputs];
    signal input outputOwnerPubKeyY[maxOutputs];
    signal input numOutputs;
    
    // Public output
    signal output outputCommitment; 
    
    // 1. Balance check: inputAmount === sum(outputAmounts)
    signal outSum[maxOutputs + 1];
    outSum[0] <== 0;
    
    for (var i = 0; i < maxOutputs; i++) {
        outSum[i + 1] <== outSum[i] + outputAmounts[i];
    }
    
    inputAmount === outSum[maxOutputs];
    
    // 2. Token script preservation: all used outputs must match input token params/script
    component tokenParamsEqual[maxOutputs];
    component isUsedSlot[maxOutputs];
    
    for (var i = 0; i < maxOutputs; i++) {
        tokenParamsEqual[i] = FieldEqual();
        tokenParamsEqual[i].a <== outputScripts[i];
        tokenParamsEqual[i].b <== inputScript;
        
        isUsedSlot[i] = LessThan(8);
        isUsedSlot[i].in[0] <== i;
        isUsedSlot[i].in[1] <== numOutputs;
        
        // If slot is used (not padding), token params/script must match
        isUsedSlot[i].out * (1 - tokenParamsEqual[i].out) === 0;
    }
    
    // 3. Commit all private inputs
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
    
    // 4. Signature verification
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

component main {public [inputAmount, outputAmounts]} = TokenTransferProof(10);
