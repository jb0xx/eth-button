const { expect } = require("chai");
const { ethers } = require("hardhat");
  
async function getBlock(key) {
    const latestBlock = await hre.ethers.provider.getBlock(key);
    return latestBlock;
}

async function logLastBlockNumber() {
    let block = await getBlock("latest");
    console.log(block.number);
}

describe("Button", function() {
    const feeInEth = .001;
    const fee = ethers.utils.parseEther(feeInEth.toString());
    const blockDelay = 3;
    const houseCut = 5;
    const seedCut = 10;
    let signers;

    beforeEach(async function () {
        Button = await ethers.getContractFactory("DegenButton");
        [owner, ...signers] = await ethers.getSigners();
        button = await Button.deploy(fee, blockDelay, houseCut, seedCut);
        await button.deployed();
    });
    
    // TODO: test this with generalized inputs, including ones that would fail
    it("Check for correct button deployment", async function () {
        await logLastBlockNumber();
        expect(await button.owner()).to.equal(await owner.getAddress());
        expect(await button.getBalance()).to.equal(0);

        let currParams = await button.getCurrParams();
        expect(currParams.fee).to.equal(fee);
        expect(currParams.blockDelay).to.equal(blockDelay);
        expect(currParams.houseCut).to.equal(houseCut);
        expect(currParams.seedCut).to.equal(seedCut);

        let nextParams = await button.getNextParams();
        expect(nextParams.fee).to.equal(fee);
        expect(nextParams.blockDelay).to.equal(blockDelay);
        expect(nextParams.houseCut).to.equal(houseCut);
        expect(nextParams.seedCut).to.equal(seedCut);
    });

    // check that pressButton increments balances appropriately with subsequent calls
    it("Check for correct balance accruals with pressButton()", async function () {
        await logLastBlockNumber();
        let precision = 6;  // number of decimal places (of eth) we desire precision to
        let expBalance = ethers.utils.parseEther('0');
        let signer, addr, lastAddr, tempFeeInEth, tempFee, options;
        let passed = 0, feeFailures = 0, repeatFailures=0;

        const iterations = 100;
        for(let i=0; i < iterations; i++) {
            signer = signers[Math.floor(Math.random() * signers.length)];
            addr = signer.address;
            tempFeeInEth = Number((feeInEth * (.9 + Math.random())).toFixed(precision)); // ~10% of transactions should fail based on this distribution
            // console.log(tempFeeInEth, addr);
            tempFee = ethers.utils.parseEther(tempFeeInEth.toString());
            options = {value: tempFee};

            if(addr == lastAddr) {      // repeat press case
                await expect(
                    button.connect(signer).pressButton(options)
                ).to.be.revertedWith('already pressed');
                repeatFailures++;
            } else if (tempFee.lt(fee)) {   // insufficient fee case
                await expect(
                    button.connect(signer).pressButton(options)
                ).to.be.revertedWith('Insufficient fee sent');
                feeFailures++;
            } else {                                // valid call case
                await button.connect(signer).pressButton(options);
                expBalance = expBalance.add(tempFee);
                lastAddr = addr;
                passed++;
            }
        }

        // check expected balances
        let expHouseFund = expBalance.mul(houseCut).div(100);
        let expSeedFund = expBalance.mul(seedCut).div(100);
        let expPrizePool = expBalance.sub(expSeedFund).sub(expHouseFund);
        expect(await button.getBalance()).to.equal(expBalance);
        expect(await button.getHouseFund()).to.equal(expHouseFund);
        expect(await button.getSeedFund()).to.equal(expSeedFund);
        expect(await button.getPrizePool()).to.equal(expPrizePool);
        
        console.log(`Test executed with:
            \n\t${passed} passed
            \n\t${feeFailures} failed due to insufficient fees
            \n\t${repeatFailures} failed due to repeat presses
        `);
    });

    it("Check for correct behavior of claimTreasure()", async function () {
        await logLastBlockNumber();
        let oldBalance = await signers[3].getBalance(); // original balance of the winning address

        const options = {value: fee};
        await button.connect(signers[1]).pressButton(options);
        await button.connect(signers[2]).pressButton(options);
        await button.connect(signers[3]).pressButton(options);
        expect(await button.getBalance()).to.equal(3*fee); // check contract balance (one block mined)

        // claim attempt by wrong wallet (two blocks mined)
        await expect( 
            button.connect(signers[1]).claimTreasure()
        ).to.be.revertedWith('nice try, but no');
        
        // premature claim attempt by wrong wallet (three blocks mined)
        await expect( 
            button.connect(signers[3]).claimTreasure()
        ).to.be.revertedWith('Patience is bitter, but its fruit is sweet');
        
        // mine one more block and try again
        await hre.network.provider.send("evm_mine", []);
        await button.connect(signers[3]).claimTreasure();
        let newBalance = await signers[3].getBalance();
        expect(newBalance.gt(oldBalance));
        expect(await button.getBalance()).to.equal(0);
    });
});