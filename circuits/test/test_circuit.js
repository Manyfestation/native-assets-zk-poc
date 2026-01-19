/**
 * Test suite for Native Asset ZK Circuit
 * 
 * Run with: node test/test_circuit.js
 */

const path = require("path");
const fs = require("fs");

const MAX_INPUTS = 20;
const MAX_OUTPUTS = 20;
const SCRIPT_PUB_KEY_LEN = 64;

// Helper: Padding
function padArray(arr, len, defaultVal = 0) {
    const result = [...arr];
    while (result.length < len) {
        result.push(defaultVal);
    }
    return result;
}

function zeroSpk() {
    return new Array(SCRIPT_PUB_KEY_LEN).fill(0);
}

function testSpk(val) {
    return new Array(SCRIPT_PUB_KEY_LEN).fill(val);
}

function padSpkArray(arr, len) {
    const result = [...arr];
    while (result.length < len) {
        result.push(zeroSpk());
    }
    return result;
}

// Generate input for a valid transaction
function generateValidInput() {

    const covenantScript = testSpk(42);   // The main locking script
    const tokenScript = testSpk(42);      // The inner token script (matches covenant for P2SH)

    return {
        // --- Inputs ---
        inputAmounts: padArray([100, 50], MAX_INPUTS),
        inputScripts: padSpkArray([covenantScript, covenantScript], MAX_INPUTS),
        inputTokenScripts: padSpkArray([tokenScript, tokenScript], MAX_INPUTS),
        numInputs: 2,

        // --- Context ---
        inputIndex: 0,

        // --- Outputs ---
        outputAmounts: padArray([80, 70], MAX_OUTPUTS),
        outputScripts: padSpkArray([covenantScript, covenantScript], MAX_OUTPUTS),
        numOutputs: 2,
        numTokenOuts: 1,

        // --- Mode ---
        isP2SHSpend: 1
    };
}

function testBalanceCheckPass() {
    const input = generateValidInput();
    return { name: "Balance Check - Pass", input, shouldPass: true };
}

function testBalanceCheckFail() {
    const input = generateValidInput();
    input.outputAmounts = padArray([100, 100], MAX_OUTPUTS);
    return { name: "Balance Check - Fail", input, shouldPass: false };
}

function testCovenantCheckPass() {
    const input = generateValidInput();
    return { name: "Covenant Check - Pass", input, shouldPass: true };
}

function testCovenantCheckFail() {
    const input = generateValidInput();
    input.outputScripts[0] = testSpk(99);  // Broken Covenant
    return { name: "Covenant Check - Fail", input, shouldPass: false };
}

function testP2SHSpendPass() {
    const input = generateValidInput();
    input.isP2SHSpend = 1;
    // inputScripts[0] (42) matches inputTokenScripts[0] (42)
    return { name: "P2SH Spend - Pass", input, shouldPass: true };
}

function testP2SHSpendFail() {
    const input = generateValidInput();
    input.isP2SHSpend = 1;
    // Mismatch all inputs
    for (let i = 0; i < MAX_INPUTS; i++) {
        input.inputScripts[i] = testSpk(100 + i);
    }
    return { name: "P2SH Spend - Fail", input, shouldPass: false };
}

// ... Test Runner Logic ...
// (Same as before, just updated signal names in inputs)

const testCases = [
    testBalanceCheckPass,
    testBalanceCheckFail,
    testCovenantCheckPass,
    testCovenantCheckFail,
    testP2SHSpendPass,
    testP2SHSpendFail,
];

async function runTest(testCase, wc) {
    const { name, input, shouldPass } = testCase();
    // console.log(`   Running: ${name}`); 

    try {
        const witness = await wc.calculateWitness(input, 0);
        if (shouldPass) return true;
        else {
            console.log(`❌ ${name}: PASSED (Should have failed)`);
            return false;
        }
    } catch (err) {
        if (!shouldPass) return true;
        else {
            console.log(`❌ ${name}: FAILED (Should have passed)`);
            console.log(`Error: ${err.message}`);
            return false;
        }
    }
}

async function runAllTests() {
    console.log("🧪 Native Asset Circuit Test Suite");

    const wasmPath = path.join(__dirname, "../main_js/main.wasm");
    const wcPath = path.join(__dirname, "../main_js/witness_calculator.js");

    if (!fs.existsSync(wasmPath)) {
        console.error("❌ Compile circuit first!");
        process.exit(1);
    }

    const wasm = fs.readFileSync(wasmPath);
    const witnessCalculator = require(wcPath);
    const wc = await witnessCalculator(wasm);

    let passed = 0;
    for (const testCase of testCases) {
        if (await runTest(testCase, wc)) passed++;
    }

    console.log(`📊 ${passed}/${testCases.length} tests passed`);
}

runAllTests().catch(console.error);
