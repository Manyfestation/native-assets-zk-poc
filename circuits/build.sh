#!/bin/bash
# Quick build and test script for the circuit

set -e

cd "$(dirname "$0")"

echo "🔧 Compiling circuit..."
../circom-macos-amd64 main.circom --r1cs --wasm --sym -o .

echo "📊 Generating witness..."
node main_js/generate_witness.js main_js/main.wasm input.json witness.wtns

echo "🔍 Witness values:"
npx snarkjs wtns export json witness.wtns witness.json
cat witness.json

echo ""
echo "✅ Success! Circuit compiled and witness generated."
