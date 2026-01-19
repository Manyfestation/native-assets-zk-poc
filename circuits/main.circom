pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/gates.circom";

// Check if two script pub keys are equal
template ScriptPubKeyEqual(len) {
    signal input a[len];
    signal input b[len];
    signal output isEqual;
    
    component eq[len];
    signal allEqual[len + 1];
    allEqual[0] <== 1;
    
    for (var i = 0; i < len; i++) {
        eq[i] = IsEqual();
        eq[i].in[0] <== a[i];
        eq[i].in[1] <== b[i];
        allEqual[i + 1] <== allEqual[i] * eq[i].out;
    }
    
    isEqual <== allEqual[len];
}

template BalanceCheck(numInputs, numOutputs) {
    signal input inputAmounts[numInputs];
    signal input outputAmounts[numOutputs];
    
    // Use signals to accumulate sums (enforced at proof time)
    signal inputSum[numInputs + 1];
    signal outputSum[numOutputs + 1];
    
    inputSum[0] <== 0;
    for (var i = 0; i < numInputs; i++) {
        inputSum[i + 1] <== inputSum[i] + inputAmounts[i];
    }
    
    outputSum[0] <== 0;
    for (var i = 0; i < numOutputs; i++) {
        outputSum[i + 1] <== outputSum[i] + outputAmounts[i];
    }
    
    // This constraint is now enforced at proof generation time!
    inputSum[numInputs] === outputSum[numOutputs];
}

template CheckSpendToSameCovenant(maxOutputs, spkLen) {
    signal input outputScripts[maxOutputs][spkLen];    
    signal input currentCovenantScript[spkLen];           
    signal input numTokenOuts;                          

    component spkEqual[maxOutputs];
    component idxLessThan[maxOutputs];
    
    for (var i = 0; i < maxOutputs; i++) {
        // Check if output script matches the covenant
        spkEqual[i] = ScriptPubKeyEqual(spkLen);
        for (var j = 0; j < spkLen; j++) {
            spkEqual[i].a[j] <== outputScripts[i][j];
            spkEqual[i].b[j] <== currentCovenantScript[j];
        }
        
        // Check if this index is a "Token Output" (must match covenant)
        idxLessThan[i] = LessThan(8); 
        idxLessThan[i].in[0] <== i;
        idxLessThan[i].in[1] <== numTokenOuts;
        
        // If i < numTokenOuts, then spkEqual must be 1 (match)
        idxLessThan[i].out * (1 - spkEqual[i].isEqual) === 0;
    }
}

template CheckP2SHSpend(maxInputs, spkLen) {
    signal input inputScripts[maxInputs][spkLen];  
    signal input currentTokenScript[spkLen];            
    
    // Check if ANY input script matches the current Token Script
    component spkEqual[maxInputs];
    signal anyMatch[maxInputs + 1];
    anyMatch[0] <== 0;
    
    for (var i = 0; i < maxInputs; i++) {
        spkEqual[i] = ScriptPubKeyEqual(spkLen);
        for (var j = 0; j < spkLen; j++) {
            spkEqual[i].a[j] <== inputScripts[i][j];
            spkEqual[i].b[j] <== currentTokenScript[j];
        }
        
        // OR Accumulator: if(anyMatch || isEqual)
        anyMatch[i + 1] <== anyMatch[i] + spkEqual[i].isEqual - anyMatch[i] * spkEqual[i].isEqual;
    }
    
    // Constraint: At least one input must match
    anyMatch[maxInputs] === 1;
}

// ============================================
// INDEX SELECTOR
// ============================================
template ArraySelector(n) {
    signal input arr[n];
    signal input index;
    signal output out;
    
    component isEq[n];
    signal selected[n + 1];
    selected[0] <== 0;
    
    for (var i = 0; i < n; i++) {
        isEq[i] = IsEqual();
        isEq[i].in[0] <== i;
        isEq[i].in[1] <== index;
        selected[i + 1] <== selected[i] + isEq[i].out * arr[i];
    }
    
    out <== selected[n];
}

// Prove correct asset transfer
template NativeAssetProof(maxInputs, maxOutputs, spkLen) {
    // Set inputs (prev state)
    signal input inputAmounts[maxInputs];                     
    signal input inputScripts[maxInputs][spkLen];                
    signal input inputTokenScripts[maxInputs][spkLen];
    signal input numInputs;
    signal input inputIndex; // Input index of a single input to identify covenant script
    
    // -- Outputs (Next State) --
    signal input outputAmounts[maxOutputs];                        
    signal input outputScripts[maxOutputs][spkLen];                   
    signal input numOutputs;                                       
    signal input numTokenOuts;                          // How many outputs carry the token forward
    
    // -- Spending Mode --
    signal input isP2SHSpend;  // 0 = signature spend, 1 = P2SH spend
    
    // Verify 
    component balanceCheck = BalanceCheck(maxInputs, maxOutputs);
    for (var i = 0; i < maxInputs; i++) {
        balanceCheck.inputAmounts[i] <== inputAmounts[i];
    }
    for (var i = 0; i < maxOutputs; i++) {
        balanceCheck.outputAmounts[i] <== outputAmounts[i];
    }
    
    // We must find the script of the input we are spending
    // currentCovenantScript = inputScripts[inputIndex]
    signal currentCovenantScript[spkLen];
    component covenantSelectors[spkLen];
    
    for (var j = 0; j < spkLen; j++) {
        covenantSelectors[j] = ArraySelector(maxInputs);
        for (var i = 0; i < maxInputs; i++) {
            covenantSelectors[j].arr[i] <== inputScripts[i][j];
        }
        covenantSelectors[j].index <== inputIndex;
        currentCovenantScript[j] <== covenantSelectors[j].out;
    }
    
    // ==========================================
    // 3. COVENANT CHECK
    // ==========================================
    // Enforce that token outputs preserve the covenant script
    
    component covenantCheck = CheckSpendToSameCovenant(maxOutputs, spkLen);
    for (var i = 0; i < maxOutputs; i++) {
        for (var j = 0; j < spkLen; j++) {
            covenantCheck.outputScripts[i][j] <== outputScripts[i][j];
        }
    }
    for (var j = 0; j < spkLen; j++) {
        covenantCheck.currentCovenantScript[j] <== currentCovenantScript[j];
    }
    covenantCheck.numTokenOuts <== numTokenOuts;
    
    
    // Verify consistency of token covenant logic 
    signal currentTokenScript[spkLen];
    component tokenSpkSelectors[spkLen];
    // For each 
    for (var j = 0; j < spkLen; j++) {
        tokenSpkSelectors[j] = ArraySelector(maxInputs);
        for (var i = 0; i < maxInputs; i++) {
            tokenSpkSelectors[j].arr[i] <== inputTokenScripts[i][j];
        }
        tokenSpkSelectors[j].index <== inputIndex;
        currentTokenScript[j] <== tokenSpkSelectors[j].out;
    }
    
    // ==========================================
    // 5. P2SH SPEND CHECK
    // ==========================================
    // If enabled, ensure the transaction is "hooked" correcty:
    // One of the inputs must have a ScriptPubKey == currentTokenScript
    
    component p2shCheck = CheckP2SHSpend(maxInputs, spkLen);
    for (var i = 0; i < maxInputs; i++) {
        for (var j = 0; j < spkLen; j++) {
            p2shCheck.inputScripts[i][j] <== inputScripts[i][j];
        }
    }
    for (var j = 0; j < spkLen; j++) {
        p2shCheck.currentTokenScript[j] <== currentTokenScript[j];
    }
    
    // If all constraints above are satisfied, the proof is valid
}

// Config: maxInputs=20, maxOutputs=20, scriptLen=64
component main = NativeAssetProof(20, 20, 64);
