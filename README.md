# ZK Native Token PoC

**Zero-knowledge token transfers on UTXO chains** — proving balance conservation and covenant preservation without revealing transaction details.

## What This Does

1. **Balance Check**: `sum(inputs) === sum(outputs)` — no tokens created or destroyed
2. **Covenant Check**: Output scripts must match the spending input's script — tokens stay in the covenant
3. **Range Check**: All amounts are valid (no underflow attacks)

The server only verifies the ZK proof — it never sees the transaction logic.

## Usage

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173

## Circuit

See [`circuits/native_token.circom`](circuits/native_token.circom) — the entire token logic .

To recompile after changes:
```bash
npm run compile:circuit && npm run setup
```

## Stack
- **Circom** — circuit language
- **snarkjs** — Groth16 prover/verifier
- **Vite + Express** — web app
