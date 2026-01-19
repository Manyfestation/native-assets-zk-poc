#!/bin/bash
set -e

# Constraints ~15k -> needs 2^14 at least. Using 2^15 for safety.
POWER=15
PTAU_FILE="pot${POWER}_final.ptau"

# Check if final ptau exists
if [ -f "$PTAU_FILE" ]; then
    echo "✅ $PTAU_FILE already exists. Skipping setup."
    exit 0
fi

echo "⚠️ $PTAU_FILE not found. Generating a new one for testing..."
echo "NOTE: This is NOT secure for production!"

# 1. Start a new powers of tau ceremony
npx snarkjs powersoftau new bn128 $POWER pot_0000.ptau

# 2. Contribute to the ceremony
npx snarkjs powersoftau contribute pot_0000.ptau pot_0001.ptau --name="First contribution" -v -e="random text"

# 3. Prepare for phase 2
npx snarkjs powersoftau prepare phase2 pot_0001.ptau $PTAU_FILE -v

# Cleanup intermediate files
rm pot_0000.ptau pot_0001.ptau

echo "✅ Generated $PTAU_FILE"
