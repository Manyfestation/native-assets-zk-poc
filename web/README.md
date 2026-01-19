# ZK Native Token POC

This project demonstrates a zk native token transfer system using Circom and Groth16 (via snarkjs).

## Prerequisites
- Nodejs
- **Circom Binary**: Required for compiling circuits.

### Circom Installation
For convenience, this project includes pre-downloaded Circom binaries in the `bin/` directory for Windows, Linux and Mac.

The build scripts will automatically detect your OS and use the appropriate local binary.If you need to manually install it, see the [official instructions](https://docs.circom.io/getting-started/installation/). 

## Project Structure
- `src/`: Client-side logic (React/Vite)
- `server/`: Express backend acting as the blockchain/sequencer
- `circuits/`: Circom circuit definitions (symlinked or copied)
- `scripts/`: Scripts for local Circom/Snarkjs playground (not needed for the web application)

## Setup

Install dependencies:
```bash
npm install
```

## Development

```bash
npm run dev
```


## Circuits

The circuit artifacts (wasm, zkey, vkey) are currently committed in `public/circuits` for ease of use.

If you modify `circuits/native_token.circom`, you must recompile:
```bash
npm run compile:circuit
```

To run the trusted setup ceremony (Phase 2) again:
```bash
npm run setup
```
