# Circom Prover

Circom/snarkjs implementation of the token transfer circuit.

## Circuit

[`circuits/token_transfer.circom`](circuits/token_transfer.circom)

**Operations:**
- Balance conservation check
- Token data preservation  
- EdDSA-Poseidon signature verification

## Artifacts

Pre-compiled artifacts in `artifacts/`:
- `token_transfer.wasm` — Witness calculator
- `token_transfer.zkey` — Proving key (Groth16)
- `verification_key.json` — Verification key
- `pot15_final.ptau` — Powers of Tau (trusted setup)

## Scripts

```bash
# Compile circuit
node scripts/compile.js

# Generate trusted setup
node scripts/setup.js
```

## Signature Scheme

Circom uses EdDSA-Poseidon on BabyJubJub with **Poseidon** hash.
This differs from ZoKrates' SHA-512 based EdDSA.

## Constraints

~14,000 constraints
