# Native Assets ZK PoC (Circom)

This project is a **Proof of Concept (PoC)** implementation of native asset verification logic using **Circom** Zero-Knowledge circuits.

## Overview

This repository originally explored using SP1 (Rust-based ZK) but has been migrated to **Circom** for circuit definition. The goal is to verify asset covenants and native token rules (e.g., balances, supplies) within a ZK proof.

Current status: **Hello World / Infrastructure Setup**
- The core circuit infrastructure is set up in `circuits/`.
- A basic "Hello World" circuit (`main.circom`) is in place to verify the environment.

## Prerequisites

To built and run this project, you need:

1.  **Node.js** & **npm**: Standard JavaScript runtime.
2.  **Rust** (optional): For installing Circom from source.
3.  **Circom**: The circuit compiler.
    - [Install Circom](https://docs.circom.io/getting-started/installation/)
4.  **snarkjs**: Tool to generate and verify ZK proofs.
    - `npm install -g snarkjs`

## Project Structure

- `circuits/`: Contains the Circom circuit definitions and npm scripts.
- `reference/`: Contains the old Rust implementation for logic reference.

## Getting Started

1.  **Navigate to the circuits directory:**
    ```bash
    cd circuits
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Compile the Circuit:**
    Use the provided script to compile `main.circom`.
    ```bash
    # (Update with actual command from package.json if available, or manual)
    # Example manual compilation:
    circom main.circom --r1cs --wasm --sym --c --output .
    ```
    *(Note: Check `circuits/package.json` for helper scripts)*

## Development Workflow

1.  Modify `circuits/main.circom`.
2.  Compile using Circom.
3.  Generate a witness using the generated WASM/C++ code.
4.  Generate a proof using `snarkjs`.

## Reference

See `REFACTORING_GUIDE.md` for details on the architecture and migration plan from the simplified Rust model to Circom constraints.
