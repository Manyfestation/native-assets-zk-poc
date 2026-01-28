package main

import (
	"fmt"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
)

// Prove knowledge of x such that x^3 + x + 5 == y, with y public.
type CubicCircuit struct {
	X frontend.Variable `gnark:"x"`
	Y frontend.Variable `gnark:",public"`
}

func (c *CubicCircuit) Define(api frontend.API) error {
	x3 := api.Mul(c.X, c.X, c.X)
	api.AssertIsEqual(c.Y, api.Add(x3, c.X, 5))
	return nil
}

func main() {
	// 1) Compile circuit -> constraint system
	var circuit CubicCircuit
	ccs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &circuit)
	if err != nil {
		panic(err)
	}

	// 2) Setup (one-time per circuit)
	pk, vk, err := groth16.Setup(ccs)
	if err != nil {
		panic(err)
	}

	// 3) Build witness (assignment)
	assignment := CubicCircuit{X: 3, Y: 35}
	witness, err := frontend.NewWitness(&assignment, ecc.BN254.ScalarField())
	if err != nil {
		panic(err)
	}
	publicWitness, err := witness.Public()
	if err != nil {
		panic(err)
	}

	// 4) Prove
	proof, err := groth16.Prove(ccs, pk, witness)
	if err != nil {
		panic(err)
	}

	// 5) Verify
	if err := groth16.Verify(proof, vk, publicWitness); err != nil {
		panic(err)
	}

	fmt.Println("OK: proof verified")
}
