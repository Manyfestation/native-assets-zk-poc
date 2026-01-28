package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"gnark-poc/circuit"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
)

func main() {
	action := flag.String("action", "compile", "Action to perform: compile, setup, prove, verify")
	outputDir := flag.String("output", "artifacts", "Output directory for artifacts")
	flag.Parse()

	// Ensure output directory exists
	if _, err := os.Stat(*outputDir); os.IsNotExist(err) {
		os.MkdirAll(*outputDir, 0755)
	}

	var myCircuit circuit.TokenTransferCircuit

	switch *action {
	case "compile":
		fmt.Println("Compiling circuit...")
		ccs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &myCircuit)
		if err != nil {
			panic(err)
		}
		
		// Save Constraint System
		// Note: We might usually save this, but for this POC we mostly need the keys.
		// However, for Setup we need CCS.
		f, _ := os.Create(filepath.Join(*outputDir, "circuit.ccs"))
		ccs.WriteTo(f)
		f.Close()
		fmt.Printf("Circuit compiled. Constraints: %d\n", ccs.GetNbConstraints())

	case "setup":
		fmt.Println("Running trusted setup...")
		// Load CCS
		// In a real flow we'd load, but here we can just re-compile for simplicity if CCS doesn't exist, 
		// but let's assume compile ran first.
		// Actually, let's just re-compile to be safe and self-contained in 'setup' if needed, 
		// but standard flow is compile -> setup.
		// We'll try to read CCS.
		
		// For simplicity in this script: Compile everywhere or read?
		// Let's compile inside setup to avoid serialization issues if versions change.
		ccs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &myCircuit)
		if err != nil {
			panic(err)
		}

		pk, vk, err := groth16.Setup(ccs)
		if err != nil {
			panic(err)
		}

		// Write Keys
		fPk, _ := os.Create(filepath.Join(*outputDir, "prover.pk"))
		pk.WriteTo(fPk)
		fPk.Close()

		fVk, _ := os.Create(filepath.Join(*outputDir, "verifier.vk"))
		vk.WriteTo(fVk)
		fVk.Close()
		
		fmt.Println("Setup complete. Keys generated.")

	case "prove":
		// This is for CLI usage. For WASM we will likely have a separate entry or build tag.
		// We'll leave this empty for now or basic implementation.
		fmt.Println("Prove mode (CLI) not fully implemented yet - focusing on WASM.")
		
	default:
		fmt.Println("Unknown action")
		os.Exit(1)
	}
}
