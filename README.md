# ZK Native Token PoC

**Zero-knowledge token transfers on UTXO chains** — proving balance conservation and covenant preservation without revealing transaction details.

## Project Structure

```
├── provers/                # ZK SDK implementations (start here!)
│   ├── zokrates/           # ZoKrates SDK
│   │   ├── circuits/       # .zok circuit files
│   │   ├── artifacts/      # Pre-compiled (program, keys)
│   │   └── scripts/        # Compile/setup scripts
│   ├── circom/             # Circom/snarkjs SDK  
│   │   ├── circuits/       # .circom circuit files
│   │   ├── artifacts/      # Pre-compiled (wasm, zkey, vkey)
│   │   └── scripts/        # Compile/setup scripts
│   └── _template/          # Template for adding new SDKs
├── web/                    # Benchmark UI + API server
└── circuits/               # Legacy (unused)
```

## Quick Start

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173/benchmark.html to compare ZoKrates vs Circom.

## What the Circuit Proves

1. **Balance Check**: `sum(inputs) === sum(outputs)` — no tokens created/destroyed
2. **Covenant Check**: Output scripts must match input script
3. **Authorization**: Valid EdDSA signature from input owner

## SDKs Compared

| SDK | Signature | Constraints | Notes |
|-----|-----------|-------------|-------|
| **ZoKrates** | EdDSA-SHA512 | ~20,000 | Browser WASM, caches after first run |
| **Circom** | EdDSA-Poseidon | ~14,000 | Pre-compiled artifacts |

See [provers/README.md](provers/README.md) for adding new SDKs.
