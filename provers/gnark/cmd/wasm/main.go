//go:build js && wasm
package main

import (
    "time"
	"bytes"
	"encoding/json"
	"fmt"
	"syscall/js"

	"gnark-poc/circuit"

	"github.com/consensys/gnark-crypto/ecc"
    "github.com/consensys/gnark-crypto/ecc/bn254/fr"
    "github.com/consensys/gnark-crypto/ecc/bn254/fr/mimc"
    "github.com/consensys/gnark-crypto/ecc/bn254/twistededwards/eddsa"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/consensys/gnark/constraint"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
)

// Global variables to hold reusable components
var (
	pk  groth16.ProvingKey
	vk  groth16.VerifyingKey
	ccs constraint.ConstraintSystem
)

func main() {
	c := make(chan struct{}, 0)

	js.Global().Set("gnarkComputeHash", js.FuncOf(computeHash))
	js.Global().Set("gnarkSign", js.FuncOf(sign))
	js.Global().Set("gnarkInit", js.FuncOf(initCircuit))
	js.Global().Set("gnarkProve", js.FuncOf(prove))
	js.Global().Set("gnarkVerify", js.FuncOf(verify))
	js.Global().Set("gnarkGetConstraints", js.FuncOf(getConstraints))

	println("Gnark WASM initialized")
	<-c
}

func sign(this js.Value, args []js.Value) interface{} {
    // args[0] = message hash (decimal string)
    msgStr := args[0].String()
    
    var msgFr fr.Element
    if _, err := msgFr.SetString(msgStr); err != nil {
        return map[string]interface{}{"error": "Invalid message: " + err.Error()}
    }
    msgBytes := msgFr.Bytes()
    
    // Generate deterministic key pair for benchmark
    // In a real app, user provides private key. 
    // Here we use a seed based on the message to "simulate" a user signing THIS message,
    // or just a constant seed for simplicity.
    // Let's use constant seed.
    seed := bytes.NewReader(make([]byte, 32)) 
    pk, _ := eddsa.GenerateKey(seed) 
    
    // Sign
    // Use MiMC for the signature logic too to match circuit expectation (if circuit uses MiMC for sig verify)
    // Wait, circuit uses `eddsa.Verify(..., &mimc)`.
    // So we must pass `mimc.NewMiMC()` here.
    sigBytes, err := pk.Sign(msgBytes[:], mimc.NewMiMC())
    if err != nil {
         return map[string]interface{}{"error": "Sign failed: " + err.Error()}
    }
    
    // Parse signature to get R and S
    // sigBytes is R || S. R is compressed point. S is scalar.
    // BN254 implementation details:
    // R is 32 bytes (compressed), S is 32 bytes.
    // Total 64 bytes.
    if len(sigBytes) != 64 {
         return map[string]interface{}{"error": fmt.Sprintf("Invalid signature length: %d", len(sigBytes))}
    }
    
    // Decode R point
    var sigObj eddsa.Signature
    if _, err := sigObj.SetBytes(sigBytes); err != nil {
         return map[string]interface{}{"error": "Failed to parse signature: " + err.Error()}
    }
    
    // Get Public Key Coords
    pub := pk.PublicKey
    
    return map[string]interface{}{
        "pubX": pub.A.X.String(),
        "pubY": pub.A.Y.String(),
        "sigRx": sigObj.R.X.String(), // Accessing R (PointAffine) -> X
        "sigRy": sigObj.R.Y.String(), // Accessing R (PointAffine) -> Y
        "sigS":  new(fr.Element).SetBytes(sigObj.S[:]).String(),
    }
}

func computeHash(this js.Value, args []js.Value) interface{} {
	// args[0] = json string of array of strings/numbers to hash
	jsonInput := args[0].String()
	
	var inputs []string
	if err := json.Unmarshal([]byte(jsonInput), &inputs); err != nil {
		return map[string]interface{}{"error": "JSON parse error: " + err.Error()}
	}

	// Create MiMC hasher
	// We need correct constants. circuit.go uses standard NewMiMC(api).
	// Outside circuit (here), we use crypto implementation.
	// circuit.go does: mimc.NewMiMC(api) which uses BN254 seed "seed" by default.
	// standard crypto mimc for BN254:
	h := mimc.NewMiMC() 

	for _, input := range inputs {
		// Parse input to big.Int or Fr
		// We can use SetString
		var e fr.Element
		if _, err := e.SetString(input); err != nil {
			return map[string]interface{}{"error": "Invalid input: " + input}
		}
		b := e.Bytes()
		h.Write(b[:])
	}

	sum := h.Sum(nil)
	// Return as decimal string
    var res fr.Element
    res.SetBytes(sum)
	return res.String()
}

func initCircuit(this js.Value, args []js.Value) interface{} {
	// Compile circuit to get CCS
	// In a real optimized app, we'd load the CCS from a file, but here we compile it client-side 
	// (fast enough for this small circuit) to avoid large downloads if possible, OR load it.
	// Loading CCS from WASM is tricky with Reader interface, let's just re-compile, it's deterministic.
	var err error
	var myCircuit circuit.TokenTransferCircuit
	fmt.Println("Compiling circuit (WASM)...")
	ccs, err = frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &myCircuit)
	if err != nil {
		return map[string]interface{}{"error": err.Error()}
	}
	
	// Load Keys
	// args[0] = pk bytes
	// args[1] = vk bytes
	pkBytes := getBytes(args[0])
	vkBytes := getBytes(args[1])
	
	pk = groth16.NewProvingKey(ecc.BN254)
	_, err = pk.ReadFrom(bytes.NewReader(pkBytes))
	if err != nil {
		return map[string]interface{}{"error": "Failed to load PK: " + err.Error()}
	}

	vk = groth16.NewVerifyingKey(ecc.BN254)
	_, err = vk.ReadFrom(bytes.NewReader(vkBytes))
	if err != nil {
		return map[string]interface{}{"error": "Failed to load VK: " + err.Error()}
	}

	return map[string]interface{}{
		"status": "ready",
		"constraints": ccs.GetNbConstraints(),
	}
}

func getConstraints(this js.Value, args []js.Value) interface{} {
	if ccs == nil {
		return 0
	}
	return ccs.GetNbConstraints()
}

func prove(this js.Value, args []js.Value) (result interface{}) {
	fmt.Println("DEBUG: prove() called from JS")
	
	// Default return
	result = map[string]interface{}{"error": "Internal: prove returned without result"}

	defer func() {
		if r := recover(); r != nil {
			fmt.Println("CRITICAL: Recovered from panic in prove:", r)
			result = map[string]interface{}{"error": fmt.Sprintf("Panic in prove: %v", r)}
		}
	}()

	// Validate Args
	if len(args) == 0 {
		return map[string]interface{}{"error": "No arguments provided"}
	}
	

    
	proofBytes, err := safeProve(args[0].String())
	if err != nil {
		fmt.Println("safeProve Error:", err)
		return map[string]interface{}{"error": err.Error()}
	}

    // safeProve now returns a struct with breakdown, or we need to refactor safeProve to return times. 
    // Actually, let's keep it simple and move the logic here or refactor safeProve to return (proof, witnessTime, proofTime, error).
    // Let's refactor safeProve to do the work and return the breakdown.
    // Wait, I can't easily change the valid signature of safeProve if I don't change the call above.
    // Let's assume safeProve is refactored below.

	// Manual conversion to Uint8Array to avoid panic in ValueOf with []byte
	proofJS := js.Global().Get("Uint8Array").New(len(proofBytes.Proof))
	js.CopyBytesToJS(proofJS, proofBytes.Proof)

	res := js.Global().Get("Object").New()
	res.Set("proof", proofJS)
    res.Set("witnessTime", proofBytes.WitnessTime.Milliseconds())
    res.Set("proofTime", proofBytes.ProofTime.Milliseconds())

	return res
}

type ProofResult struct {
    Proof []byte
    WitnessTime time.Duration
    ProofTime time.Duration
}

func safeProve(jsonInput string) (*ProofResult, error) {
	fmt.Println("DEBUG: safeProve started")

    start := time.Now()

	// 1. Witness Generation (including parsing)
	type WitnessDTO struct {
		InputAmount string
		TokenParams string
		OriginalPubKey struct {
			A struct {
				X string
				Y string
			}
		}
		Signature struct {
			R struct {
				X string
				Y string
			}
			S string
		}
		OutputAmounts      []string
		OutputTokenParams  []string
		OutputOwnerPubKeyX []string
	}

	var dto WitnessDTO
	if err := json.Unmarshal([]byte(jsonInput), &dto); err != nil {
		return nil, fmt.Errorf("JSON parse error: %v", err)
	}

    // Construct Circuit Witness
    var witness circuit.TokenTransferCircuit
    
    // Assign fields
    witness.InputAmount = dto.InputAmount
    witness.TokenParams = dto.TokenParams
    
    // Signature
    witness.Signature.R.X = dto.Signature.R.X
    witness.Signature.R.Y = dto.Signature.R.Y
    witness.Signature.S = dto.Signature.S
    
    // PubKey
    witness.OriginalPubKey.A.X = dto.OriginalPubKey.A.X
    witness.OriginalPubKey.A.Y = dto.OriginalPubKey.A.Y
    
    // Arrays
    if len(dto.OutputAmounts) != 10 {
         return nil, fmt.Errorf("Expected 10 OutputAmounts, got %d", len(dto.OutputAmounts))
    }
    
    for i := 0; i < 10; i++ {
        witness.OutputAmounts[i] = dto.OutputAmounts[i]
        witness.OutputTokenParams[i] = dto.OutputTokenParams[i]
        witness.OutputOwnerPubKeyX[i] = dto.OutputOwnerPubKeyX[i]
    }

	fmt.Println("Circuit witness constructed. Creating frontend.Witness...")

	// Create witness
	w, err := frontend.NewWitness(&witness, ecc.BN254.ScalarField())
	if err != nil {
		return nil, fmt.Errorf("Witness creation error: %v", err)
	}
    
    witnessTime := time.Since(start)

	fmt.Println("Witness created successfully. Running Prove...")

    if ccs == nil {
         return nil, fmt.Errorf("CCS is nil! Circuit not initialized properly.")
    }
    if pk == nil {
         return nil, fmt.Errorf("ProvingKey is nil! Keys not loaded.")
    }

	// 2. Proving
    startProof := time.Now()
	proof, err := groth16.Prove(ccs, pk, w)
	if err != nil {
		return nil, fmt.Errorf("Proving error: %v", err)
	}
    proofTime := time.Since(startProof)

	fmt.Println("Proof generated successfully")

	// Serialize proof
	var buf bytes.Buffer
	proof.WriteTo(&buf)
	
	return &ProofResult{
        Proof: buf.Bytes(),
        WitnessTime: witnessTime,
        ProofTime: proofTime,
    }, nil
}

func verify(this js.Value, args []js.Value) interface{} {
    // Basic verification stub
    return map[string]interface{}{"valid": true}
}

func getBytes(v js.Value) []byte {
	length := v.Get("byteLength").Int()
	data := make([]byte, length)
	js.CopyBytesToGo(data, v)
	return data
}
