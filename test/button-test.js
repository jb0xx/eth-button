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
        expect(await button.getLastClicked() == 0);      // lastClicked should be initialized to 0x0

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

        // test cases
        const iterations = 10;
        for(let i=0; i < iterations; i++) {
            signer = signers[Math.floor(Math.random() * signers.length)];
            addr = signer.address;
            tempFeeInEth = Number((feeInEth * (.9 + Math.random())).toFixed(precision)); // ~10% of transactions should fail based on this distribution
            tempFee = ethers.utils.parseEther(tempFeeInEth.toString());
            options = {value: tempFee};

            if(addr == lastAddr) {          // repeat press case
                await expect(
                    button.connect(signer).pressButton(options)
                ).to.be.revertedWith('already pressed');
                repeatFailures++;
            } else if (tempFee.lt(fee)) {   // insufficient fee case
                await expect(
                    button.connect(signer).pressButton(options)
                ).to.be.revertedWith('Insufficient fee sent');
                feeFailures++;
            } else {                        // valid call case
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

    // TODO: add random loop of test cases
    it("Check for correct behavior of claimPrize()", async function () {
        await logLastBlockNumber();
        let fatFee = ethers.utils.parseEther("100");
        let prizePool;
        let balOriginal = await signers[1].getBalance(); // original balance of the winning address

        // press button and check for correct vals
        await button.connect(signers[1]).pressButton({value: fatFee});
        expect(signers[1].address == await button.getLastClicked());                    // check lastClicked has been updated
        expect(balOriginal.sub(fatFee)).to.gt(await signers[1].getBalance());           // check fatFee+gas has left wallet
        expect(await button.getBalance()).to.equal(fatFee);                             // check contract balance
        expect(await button.getSeedFund()).to.equal(fatFee.mul(seedCut).div(100));      // check seedFund balance
        expect(await button.getHouseFund()).to.equal(fatFee.mul(houseCut).div(100));    // check houseFund balance

        // premature claim attempt by right wallet (one block mined)
        await expect( 
            button.connect(signers[1]).claimPrize()
        ).to.be.revertedWith("Patience is bitter, but its fruit is sweet");
        expect(signers[1].address == await button.getLastClicked());
        prizePool = await button.getPrizePool();
        expect(prizePool).to.equal(fatFee.mul(100-(houseCut+seedCut)).div(100));

        // premature claim attempt by wrong wallet (two blocks mined)
        await expect( 
            button.connect(signers[3]).claimPrize()
        ).to.be.revertedWith("nice try, but no");
        prizePool = await button.getPrizePool();
        expect(prizePool).to.equal(fatFee.mul(100-(houseCut+seedCut)).div(100));
        expect(signers[1].address == await button.getLastClicked());

        // claim by correct wallet (three blocks mined)
        await button.connect(signers[1]).claimPrize();
        let expHouseFund = fatFee.mul(houseCut).div(100);                           // calculate houseFund
        let expSeedFund = fatFee.mul(seedCut).div(100);                             // calculate seedFund
        expect(await button.getPrizePool()).to.equal(0);                            // check prizePool
        expect(await button.getHouseFund()).to.equal(expHouseFund);                 // check houseFund
        expect(await button.getSeedFund()).to.equal(expSeedFund);                   // check seedFund
        expect(await button.getBalance()).to.equal(expHouseFund.add(expSeedFund));  // remaining balance = seedFund + houseFund
        expect(
            await signers[1].getBalance()
        ).to.lt(balOriginal.sub(expHouseFund).add(expSeedFund));    // balance of wallet should be original, net gas and seed/house cuts 
        
        // await hre.network.provider.send("evm_mine", []);
    });


    it("Check functionality & access control of Owner functions", async function () {

    });

    // TODO: implement bribing functionality first
    it("Ensure correct behavior with seeding and bribing", async function () {
        await logLastBlockNumber();
        
    });


});