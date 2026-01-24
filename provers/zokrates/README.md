# ZoKrates Prover

ZoKrates implementation of the token transfer circuit.

## Circuit

[`circuits/token_transfer.zok`](circuits/token_transfer.zok)

**Operations:**
- Balance conservation check
- Token data preservation
- EdDSA signature verification (SHA-512 based)

## Artifacts

Pre-compiled artifacts in `artifacts/`:
- `program` — Compiled circuit
- `proving.key` — Proving key
- `verification.key` — Verification key

## Scripts

```bash
# Compile circuit (requires ZoKrates WASM in browser or CLI)
node scripts/compile.js

# Generate keys
node scripts/setup.js
```

## Signature Scheme

ZoKrates uses EdDSA on BabyJubJub with **SHA-512** message format (`u32[8]` arrays).
This differs from Circom's EdDSA-Poseidon.

## Constraints

~20,000 constraints (dominated by EdDSA verification)
