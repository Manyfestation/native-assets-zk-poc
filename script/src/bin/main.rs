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
use fibonacci_lib::{PayloadState, PrevOut, PrevOutsType, TokenOutput};
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

    let prev_outs: PrevOutsType = [
        Some(PrevOut {
            idx: 1,
            txid: Some([5u8; 32]),
            state: PayloadState {
                outs: vec![
                    TokenOutput {
                        pub_key: [0u8; 32],
                        amount: 50,
                    },
                    TokenOutput {
                        pub_key: [1u8; 32],
                        amount: 100,
                    },
                ],
            },
        }),
        Some(PrevOut {
            idx: 0,
            txid: None,
            state: PayloadState {
                outs: vec![TokenOutput {
                    pub_key: [1u8; 32],
                    amount: 50,
                }],
            },
        }),
        None,
        None,
        None,
        None,
    ];

    let current_input_idx: usize = 0;
    let current_input_sig: Vec<u8> = vec![0u8; 64]; // Dummy signature
    let next_state = PayloadState {
        outs: vec![
            TokenOutput {
                pub_key: [0u8; 32],
                amount: 80,
            },
            TokenOutput {
                pub_key: [1u8; 32],
                amount: 70,
            },
        ],
    };

    // Setup the inputs.
    let mut stdin = SP1Stdin::new();
    stdin.write(&prev_outs);
    stdin.write(&current_input_idx);
    stdin.write(&current_input_sig);
    stdin.write(&next_state);

    if args.execute {
        // Execute the program
        let (_output, report) = client.execute(FIBONACCI_ELF, &stdin).run().unwrap();
        println!("Program executed successfully.");

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
