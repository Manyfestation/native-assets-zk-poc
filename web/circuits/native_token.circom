pragma circom 2.0.0;

include "../../circuits/node_modules/circomlib/circuits/comparators.circom";

// Compare two byte arrays for equality
template ByteArrayEqual(len) {
    signal input a[len];
    signal input b[len];
    signal output out;

    component eq[len];
    signal allEqual[len + 1];
    allEqual[0] <== 1;

    for (var i = 0; i < len; i++) {
        eq[i] = IsEqual();
        eq[i].in[0] <== a[i];
        eq[i].in[1] <== b[i];
        allEqual[i + 1] <== allEqual[i] * eq[i].out;
    }

    out <== allEqual[len];
}

// Select element from array by index
template ArraySelect(n) {
    signal input arr[n];
    signal input idx;
    signal output out;

    component isEq[n];
    signal sum[n + 1];
    sum[0] <== 0;

    for (var i = 0; i < n; i++) {
        isEq[i] = IsEqual();
        isEq[i].in[0] <== i;
        isEq[i].in[1] <== idx;
        sum[i + 1] <== sum[i] + isEq[i].out * arr[i];
    }

    out <== sum[n];
}

// Main circuit: Prove valid token transfer
template NativeAssetProof(maxInputs, maxOutputs, spkLen) {
    // Inputs (spending UTXOs)
    signal input inputAmounts[maxInputs];
    signal input inputSpks[maxInputs][spkLen];
    signal input currentInputIdx;

    // Outputs (creating UTXOs)
    signal input outputAmounts[maxOutputs];
    signal input outputSpks[maxOutputs][spkLen];
    signal input numOutputs;

    // 1. BALANCE CHECK: sum(inputs) === sum(outputs)
    signal inSum[maxInputs + 1];
    signal outSum[maxOutputs + 1];
    inSum[0] <== 0;
    outSum[0] <== 0;

    for (var i = 0; i < maxInputs; i++) {
        inSum[i + 1] <== inSum[i] + inputAmounts[i];
    }
    for (var i = 0; i < maxOutputs; i++) {
        outSum[i + 1] <== outSum[i] + outputAmounts[i];
    }

    inSum[maxInputs] === outSum[maxOutputs];

    // 2. Range check: prevent underflow (amounts must be < 2^64)
    component rangeCheck[maxOutputs];
    for (var i = 0; i < maxOutputs; i++) {
        rangeCheck[i] = LessEqThan(64);
        rangeCheck[i].in[0] <== outputAmounts[i];
        rangeCheck[i].in[1] <== 18446744073709551615; // 2^64 - 1
        rangeCheck[i].out === 1;
    }

    // 3. Select covenant: get the spending input's script
    signal covenant[spkLen];
    component selectors[spkLen];

    for (var j = 0; j < spkLen; j++) {
        selectors[j] = ArraySelect(maxInputs);
        for (var i = 0; i < maxInputs; i++) {
            selectors[j].arr[i] <== inputSpks[i][j];
        }
        selectors[j].idx <== currentInputIdx;
        covenant[j] <== selectors[j].out;
    }

    // 4. Covenant check: active outputs must match covenant script
    component spkMatch[maxOutputs];
    component isActive[maxOutputs];

    for (var i = 0; i < maxOutputs; i++) {
        spkMatch[i] = ByteArrayEqual(spkLen);
        for (var j = 0; j < spkLen; j++) {
            spkMatch[i].a[j] <== outputSpks[i][j];
            spkMatch[i].b[j] <== covenant[j];
        }

        isActive[i] = LessThan(8);
        isActive[i].in[0] <== i;
        isActive[i].in[1] <== numOutputs;

        // If output is active, it must match the covenant
        isActive[i].out * (1 - spkMatch[i].out) === 0;
    }
}

// Public signals: server verifies inputs match ledger, then applies outputs
component main {public [inputAmounts, outputAmounts]} = NativeAssetProof(10, 10, 8);
