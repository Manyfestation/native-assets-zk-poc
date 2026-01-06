//! An end-to-end example of using the SP1 SDK to generate a proof of a program that can be executed
//! or have a core proof generated.
//!
//! You can run this script using the following command:
//! ```shell
//! RUST_LOG=info cargo run --release -- --execute
//! ```
//! or
//! ```shell
//! RUST_LOG=info cargo run --release -- --prove
//! ```

use clap::Parser;
use fibonacci_lib::{PayloadState, PubKey, TokenOutput};
use sp1_sdk::{include_elf, ProverClient, SP1Stdin};

/// The ELF (executable and linkable format) file for the Succinct RISC-V zkVM.
pub const FIBONACCI_ELF: &[u8] = include_elf!("fibonacci-program");

/// The arguments for the command.
#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[arg(long)]
    execute: bool,

    #[arg(long)]
    prove: bool,

    #[arg(long, default_value = "20")]
    n: u32,
}

fn main() {
    // Setup the logger.
    sp1_sdk::utils::setup_logger();
    dotenv::dotenv().ok();

    // Parse the command line arguments.
    let args = Args::parse();

    if args.execute == args.prove {
        eprintln!("Error: You must specify either --execute or --prove");
        std::process::exit(1);
    }

    // Setup the prover client.
    let client = ProverClient::from_env();

    let prev_state = PayloadState {
        outs: vec![
            TokenOutput {
                pub_key: PubKey([0u8; 32]),
                amount: 100,
            },
            TokenOutput {
                pub_key: PubKey([1u8; 32]),
                amount: 50,
            },
        ],
    };
    let next_state = PayloadState {
        outs: vec![
            TokenOutput {
                pub_key: PubKey([0u8; 32]),
                amount: 100,
            },
            TokenOutput {
                pub_key: PubKey([1u8; 32]),
                amount: 50,
            },
        ],
    };

    // Setup the inputs.
    let mut stdin = SP1Stdin::new();
    stdin.write(&prev_state);
    stdin.write(&next_state);

    println!("n: {}", args.n);

    if args.execute {
        // Execute the program
        let (mut output, report) = client.execute(FIBONACCI_ELF, &stdin).run().unwrap();
        println!("Program executed successfully.");

        // Read the output.
        let success = output.read::<bool>();
        println!("Success: {}", success);

        // Record the number of cycles executed.
        println!("Number of cycles: {}", report.total_instruction_count());
    } else {
        // Setup the program for proving.
        let (pk, vk) = client.setup(FIBONACCI_ELF);

        // Generate the proof
        let proof = client
            .prove(&pk, &stdin)
            .run()
            .expect("failed to generate proof");

        println!("Successfully generated proof!");

        // Verify the proof.
        client.verify(&proof, &vk).expect("failed to verify proof");
        println!("Successfully verified proof!");
    }
}
