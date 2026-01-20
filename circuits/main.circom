pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";


// Main circuit 
template NativeAsset(nInputs, nOutputs) {
    // Private inputs
    signal input inAmounts[nInputs];        // Token amounts being spent
    signal input inCovenants[nInputs];      // Covenant ID of each input (simplified to single field)
    
    signal input outAmounts[nOutputs];      // Token amounts being created
    signal input outCovenants[nOutputs];    // Covenant ID of each output
    
    signal input spendingCovenant;          // Which covenant we're spending from
    
    // Public output
    signal output commitment;               // Poseidon hash of all private inputs
    
    /////////////
    // Balance check
    // Sum of inputs must equal sum of outputs
    signal inSum[nInputs + 1];
    inSum[0] <== 0;
    for (var i = 0; i < nInputs; i++) {
        inSum[i + 1] <== inSum[i] + inAmounts[i];
    }
    
    signal outSum[nOutputs + 1];
    outSum[0] <== 0;
    for (var i = 0; i < nOutputs; i++) {
        outSum[i + 1] <== outSum[i] + outAmounts[i];
    }
    
    // Assert in == out
    inSum[nInputs] === outSum[nOutputs];
    //////////////
    
    //////////////
    // Covenant preservation
    // All outputs must go back to the same covenant
    component covenantMatch[nOutputs];
    component isUsed[nOutputs];

    for (var i = 0; i < nOutputs; i++) {
        // Check if this slot is used (amount > 0)
        isUsed[i] = IsZero();
        isUsed[i].in <== outAmounts[i];
        // isUsed[i].out = 1 if amount is 0, else 0
        
        covenantMatch[i] = IsEqual();
        covenantMatch[i].in[0] <== outCovenants[i];
        covenantMatch[i].in[1] <== spendingCovenant;
        
        // If slot is used (isUsed.out = 0), covenant must match
        // If slot is unused (isUsed.out = 1), don't care
        // Constraint: isUsed OR covenantMatch
        // (1 - isUsed) * (1 - covenantMatch) === 0
        (1 - isUsed[i].out) * (1 - covenantMatch[i].out) === 0;
    }
    
    // Input authorization
    // At least one input must be from the spending covenant
    signal hasAuth[nInputs + 1];
    hasAuth[0] <== 0;
    component authCheck[nInputs];
    for (var i = 0; i < nInputs; i++) {
        authCheck[i] = IsEqual();
        authCheck[i].in[0] <== inCovenants[i];
        authCheck[i].in[1] <== spendingCovenant;
        
        // OR accumulator: hasAuth[i+1] = hasAuth[i] OR authCheck[i]
        // OR(a,b) = a + b - a*b
        hasAuth[i + 1] <== hasAuth[i] + authCheck[i].out - hasAuth[i] * authCheck[i].out;
    }
    
    hasAuth[nInputs] === 1;  // THE CONSTRAINT
    
    
    // Hash all private inputs so verifier can check
    // "this proof is about THESE specific values"
    
    // Poseidon has input limits, so we hash in chunks then combine
    // For simplicity: hash inputs, hash outputs, combine
    
    component hashInputs = Poseidon(nInputs * 2);  // amounts + covenants
    for (var i = 0; i < nInputs; i++) {
        hashInputs.inputs[i] <== inAmounts[i];
        hashInputs.inputs[nInputs + i] <== inCovenants[i];
    }
    
    component hashOutputs = Poseidon(nOutputs * 2);
    for (var i = 0; i < nOutputs; i++) {
        hashOutputs.inputs[i] <== outAmounts[i];
        hashOutputs.inputs[nOutputs + i] <== outCovenants[i];
    }
    
    component finalHash = Poseidon(3);
    finalHash.inputs[0] <== hashInputs.out;
    finalHash.inputs[1] <== hashOutputs.out;
    finalHash.inputs[2] <== spendingCovenant;
    
    commitment <== finalHash.out;
}

// 3 inputs, 3 outputs - small for learning
component main {public [commitment]} = NativeAsset(3, 3);