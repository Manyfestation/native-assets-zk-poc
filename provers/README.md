# ZK Provers

This directory contains isolated implementations for each ZK SDK being evaluated.

## Directory Structure

```
provers/
├── zokrates/           # ZoKrates SDK implementation
├── circom/             # Circom/snarkjs implementation
└── _template/          # Template for adding new SDKs
```

## Quick Start

Each prover has:
- `circuits/` — Source circuit files
- `artifacts/` — Pre-compiled artifacts (wasm, keys, etc.)
- `scripts/` — Compile and setup scripts
- `README.md` — SDK-specific documentation

## Adding a New SDK

1. Copy `_template/` to `your-sdk/`
2. Implement the circuit in your SDK's language
3. Create compile/setup scripts
4. Add prover implementation to `web/src/provers/`
