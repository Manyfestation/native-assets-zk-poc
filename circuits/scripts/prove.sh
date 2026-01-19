#!/bin/bash
set -e

# Ensure we are in the circuits directory
cd "$(dirname "$0")/.."

echo "🚀 Starting Full Proof Flow..."

# 1. Compile the circuit
echo "🔨 Compiling circuit..."
if [ ! -d "build" ]; then
    mkdir build
fi
# Use local circom binary if present, otherwise assume in path or try the one in parent dir
CIRCOM_CMD=circom
if [ -f "../circom-macos-amd64" ]; then
    CIRCOM_CMD=../circom-macos-amd64
fi

$CIRCOM_CMD main.circom --r1cs --wasm --sym -o build

# 2. Trusted Setup (PTAU)
echo "🛡️  Checking Trusted Setup..."
./scripts/setup_ptau.sh

# 3. Generate Witness
echo "👀 Generating Witness..."
# input.json should be prepared by now (we created it)
node build/main_js/generate_witness.js build/main_js/main.wasm input.json build/witness.wtns

# 4. Phase 2 Setup (Circuit Specific)
echo "🔑 Generating Circuit Keys..."
# Use pot15_final.ptau (updated from pot12)
npx snarkjs groth16 setup build/main.r1cs pot15_final.ptau build/circuit_0000.zkey

# 5. Export Verification Key
echo "📤 Exporting Verification Key..."
npx snarkjs zkey export verificationkey build/circuit_0000.zkey build/verification_key.json

# 6. Generate Proof
echo "📝 Generating Proof..."
npx snarkjs groth16 prove build/circuit_0000.zkey build/witness.wtns build/proof.json build/public.json

# 7. Verify Proof
echo "✅ Verifying Proof..."
npx snarkjs groth16 verify build/verification_key.json build/public.json build/proof.json

echo "🎉 Success! Proof generated and verified."
