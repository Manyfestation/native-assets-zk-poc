# Native Assets ZK - Circom Refactoring Guide

This guide walks through porting the SP1/Rust native token logic to **Circom** with **Groth16** proofs.

## Environment Setup ✅

Your environment is ready:
- **Circom compiler**: `./circom-macos-amd64`
- **Standard library**: `circuits/node_modules/circomlib`
- **SnarkJS**: For witness generation and proving

### Quick Commands

```bash
cd circuits

# 1. Compile circuit
../circom-macos-amd64 main.circom --r1cs --wasm --sym -o .

# 2. Generate witness
node main_js/generate_witness.js main_js/main.wasm input.json witness.wtns

# 3. View witness (for debugging)
npx snarkjs wtns export json witness.wtns witness.json && cat witness.json
```

---

## Reference: What We're Porting

From `reference/main.rs`, the circuit needs to verify:

| Rust Function | Purpose | Circom Equivalent |
|---------------|---------|-------------------|
| `balance_check()` | Sum(inputs) == Sum(outputs) | Simple addition constraint |
| `check_spend_to_same_covenant()` | Token outputs preserve ScriptPubKey | Equality check with selector |
| `check_sig()` | Verify signature (currently mocked!) | **EdDSA Poseidon** from circomlib |
| `extract_pub_key_from_script_pub_key()` | Parse SPK → pubkey | Logic outside circuit or hash |

---

## Step-by-Step Refactoring

### Step 1: Balance Check (Easy)

**Rust:**
```rust
let total_in = prev_outs.iter().map(|p| p.state.outs[p.idx].amount).sum();
let total_out = next_state.outs.iter().map(|o| o.amount).sum();
assert_eq!(total_in, total_out);
```

**Circom:**
```circom
signal input inAmounts[MAX_INPUTS];
signal input outAmounts[MAX_OUTPUTS];

var sumIn = 0;
for (var i = 0; i < MAX_INPUTS; i++) {
    sumIn += inAmounts[i];
}

var sumOut = 0;
for (var i = 0; i < MAX_OUTPUTS; i++) {
    sumOut += outAmounts[i];
}

sumIn === sumOut;  // This is the constraint!
```

**Test:** Set `inAmounts = [100, 0, 0]` and `outAmounts = [60, 40, 0]`. Should pass.

---

### Step 2: Covenant Check (Medium)

**Rust:**
```rust
outs.iter()
    .take(num_token_outs)
    .all(|out| out.script_pub_key == current_utxo_script_pub_key)
```

**Circom:**
```circom
signal input inSpks[MAX_INPUTS];      // ScriptPubKeys (as field elements)
signal input outSpks[MAX_OUTPUTS];
signal input isTokenOut[MAX_OUTPUTS]; // 1 if token output, 0 otherwise
signal input currentInputIdx;

// Select current input's SPK using Multiplexer
include "node_modules/circomlib/circuits/multiplexer.circom";

component spkSelector = Multiplexer(1, MAX_INPUTS);
spkSelector.sel <== currentInputIdx;
for (var i = 0; i < MAX_INPUTS; i++) {
    spkSelector.inp[i][0] <== inSpks[i];
}
signal currentSpk <== spkSelector.out[0];

// Enforce: if isTokenOut[i] == 1, then outSpks[i] must equal currentSpk
for (var i = 0; i < MAX_OUTPUTS; i++) {
    isTokenOut[i] * (outSpks[i] - currentSpk) === 0;
}
```

---

### Step 3: Signature Verification (Hard - The Main Task)

**This is where Poseidon comes in.** Per Yonatan's request, use Poseidon instead of Blake2b.

**Current Rust (mocked):**
```rust
fn check_sig(_sig: Vec<u8>, _pub_key: &[u8], _msg: SignatureMessage) -> bool {
    true  // NOT IMPLEMENTED!
}
```

**Circom (real implementation):**
```circom
include "node_modules/circomlib/circuits/eddsaposeidon.circom";

// EdDSA signature verification with Poseidon hash
component sigVerifier = EdDSAVerifier(EDDSA_MESSAGE_SIZE);

// Inputs for signature
sigVerifier.enabled <== 1;
sigVerifier.Ax <== pubKeyX;
sigVerifier.Ay <== pubKeyY;
sigVerifier.R8x <== sigR8x;
sigVerifier.R8y <== sigR8y;
sigVerifier.S <== sigS;

// Message to sign (hashed with Poseidon)
for (var i = 0; i < EDDSA_MESSAGE_SIZE; i++) {
    sigVerifier.msg[i] <== msgBits[i];
}
```

**Important:** EdDSA in circomlib uses the **Baby Jubjub** curve (compatible with BN254 field).

---

### Step 4: Poseidon Hashing

Use Poseidon to hash transaction data before signing:

```circom
include "node_modules/circomlib/circuits/poseidon.circom";

// Hash the output amounts + SPKs as commitment
component hasher = Poseidon(4);
hasher.inputs[0] <== outAmounts[0];
hasher.inputs[1] <== outAmounts[1];
hasher.inputs[2] <== outSpks[0];
hasher.inputs[3] <== outSpks[1];

signal txHash <== hasher.out;
```

---

## File Structure

```
circuits/
├── main.circom          # Your main circuit (edit this)
├── input.json           # Test inputs
├── package.json         # Dependencies
└── node_modules/
    └── circomlib/       # Standard library (Poseidon, EdDSA, etc.)
```

---

## Testing Workflow

1. **Edit** `main.circom`
2. **Edit** `input.json` with test values
3. **Compile**: `../circom-macos-amd64 main.circom --r1cs --wasm --sym -o .`
4. **Witness**: `node main_js/generate_witness.js main_js/main.wasm input.json witness.wtns`
5. **Inspect**: `npx snarkjs wtns export json witness.wtns witness.json`

If witness generation fails, the constraints are not satisfied (good for testing!).

---

## Groth16 Proof Generation (Later)

Once circuit is complete:

```bash
# 1. Download Powers of Tau (one-time, ~100MB)
wget https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_15.ptau

# 2. Setup
npx snarkjs groth16 setup main.r1cs powersOfTau28_hez_final_15.ptau main_0000.zkey

# 3. Generate proof
npx snarkjs groth16 prove main_0000.zkey witness.wtns proof.json public.json

# 4. Verify
npx snarkjs groth16 verify verification_key.json public.json proof.json
```

---

## Code Readability Notes

Per Yonatan's concern about readability:

| Aspect | Circom Reality |
|--------|----------------|
| Syntax | C-like, readable |
| Constraints | Explicit `===` makes logic clear |
| Debugging | `log()` statements, witness inspection |
| Complexity | EdDSA/Poseidon are library calls, not reimplemented |

**Verdict:** Circuit logic is readable. The hard part is understanding ZK constraints, not the code itself.

---

## Next: Your First Real Step

Edit `circuits/main.circom` to add the **Balance Check**. Start simple:

```circom
pragma circom 2.0.0;

template NativeAsset() {
    signal input inAmounts[2];
    signal input outAmounts[2];
    
    // Balance check
    var sumIn = inAmounts[0] + inAmounts[1];
    var sumOut = outAmounts[0] + outAmounts[1];
    sumIn === sumOut;
}

component main = NativeAsset();
```

And `input.json`:
```json
{
    "inAmounts": ["100", "50"],
    "outAmounts": ["80", "70"]
}
```

Try it! It should pass (100+50 = 80+70 = 150).
