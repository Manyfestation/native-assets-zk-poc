package circuit

import (
	tedwards "github.com/consensys/gnark-crypto/ecc/twistededwards"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/std/algebra/native/twistededwards"
	"github.com/consensys/gnark/std/hash/mimc"
	"github.com/consensys/gnark/std/signature/eddsa"
)

const MaxOutputs = 10

// TokenTransferCircuit defines the circuit for privacy-preserving token transfers.
// It verifies:
// 1. Balance conservation
// 2. Token type preservation
// 3. Ownership authorization (EdDSA signature)
type TokenTransferCircuit struct {
	// Public inputs
	OutputAmounts      [MaxOutputs]frontend.Variable `gnark:",public"`
	OutputTokenParams  [MaxOutputs]frontend.Variable `gnark:",public"`
	OutputOwnerPubKeyX [MaxOutputs]frontend.Variable `gnark:",public"`

	// Private inputs
	InputAmount    frontend.Variable
	TokenParams    frontend.Variable
	Signature      eddsa.Signature
	OriginalPubKey eddsa.PublicKey
}

// Define declares the circuit constraints
func (c *TokenTransferCircuit) Define(api frontend.API) error {
	// 1. Balance Conservation: inputAmount == sum(outputAmounts)
	totalOut := frontend.Variable(0)
	for i := 0; i < MaxOutputs; i++ {
		totalOut = api.Add(totalOut, c.OutputAmounts[i])
	}
	api.AssertIsEqual(c.InputAmount, totalOut)

	// 2. Token Params Preservation: all non-zero outputs must match input tokenParams
	// if outputAmount > 0, then outputTokenParam == tokenParams
	// equiv: outputAmount * (outputTokenParam - tokenParams) == 0
	for i := 0; i < MaxOutputs; i++ {
		diff := api.Sub(c.OutputTokenParams[i], c.TokenParams)
		check := api.Mul(c.OutputAmounts[i], diff)
		api.AssertIsEqual(check, 0)
	}

	// 3. Compute output commitments using Poseidon
	// We use gnark's std/hash/poseidon2 for compatibility
	// outputData0 = poseidon2([outputAmounts[0], outputTokenParams[0], outputOwnerPubKeyX[0]]);
	// outputData1 = poseidon2([outputAmounts[1], outputTokenParams[1], outputOwnerPubKeyX[1]]);
	// outputCommitment = poseidon2([outputData0, outputData1]);

	// Poseidon instance (swapped to MiMC for compatibility)
	hasher, _ := mimc.NewMiMC(api)

	// Output 0
	hasher.Write(c.OutputAmounts[0])
	hasher.Write(c.OutputTokenParams[0])
	hasher.Write(c.OutputOwnerPubKeyX[0])
	outputData0 := hasher.Sum()
	hasher.Reset()

	// Output 1
	hasher.Write(c.OutputAmounts[1])
	hasher.Write(c.OutputTokenParams[1])
	hasher.Write(c.OutputOwnerPubKeyX[1])
	outputData1 := hasher.Sum()
	hasher.Reset()

	// Final Commitment
	hasher.Write(outputData0)
	hasher.Write(outputData1)
	outputCommitment := hasher.Sum()
    
    // We don't have outputCommitment as a public input in this circuit struct to assert against,
    // but we use it for the signature verification message below.

	// 4. EdDSA Signature Verification
	// We need the curve parameters. Zokrates uses BabyJubJub.
	// Gnark's twistededwards package supports BN254 (which BabyJubJub is embedded in).
	curve, err := twistededwards.NewEdCurve(api, tedwards.BN254)
	if err != nil {
		return err
	}

    // Message Construction
    // We sign (InputAmount, TokenParams, OutputCommitment) to match general security model
    
    msgHasher, _ := mimc.NewMiMC(api)
    msgHasher.Write(c.InputAmount)
    msgHasher.Write(c.TokenParams)
    msgHasher.Write(outputCommitment)
    message := msgHasher.Sum()

    // Create a fresh hasher for EdDSA signature verification
    // (the hasher passed to Verify is used to compute H(R, A, M))
    eddsaHasher, _ := mimc.NewMiMC(api)
    return eddsa.Verify(curve, c.Signature, message, c.OriginalPubKey, &eddsaHasher)
}
