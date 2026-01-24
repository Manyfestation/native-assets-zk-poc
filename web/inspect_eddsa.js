
const circomlibjs = require('circomlibjs');

async function main() {
    try {
        const eddsa = await circomlibjs.buildEddsa();
        console.log("Keys on eddsa object:", Object.keys(eddsa));
        console.log("Type of eddsa.sign:", typeof eddsa.sign);
        console.log("Type of eddsa.signPoseidon:", typeof eddsa.signPoseidon);
        console.log("Type of eddsa.signMiMC:", typeof eddsa.signMiMC);
    } catch (e) {
        console.error(e);
    }
}

main();
