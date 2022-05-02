const { expect } = require("chai");
const { ethers } = require("hardhat");
  
describe("Button", function() {
    const fee = ethers.utils.parseEther(".001");
    let addr1, addr2, addr3, addrs;

    beforeEach(async function () {
        Button = await ethers.getContractFactory("DegenButton");
        [addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
      
        button = await Button.deploy(fee); // fee set to .001ETH
    });
    

    it("Check for correct behavior of pressButton()", async function () {
        await button.deployed();
        expect(await button.getBalance()).to.equal(0);
        const options = {value: fee};
        
        // check that pressButton succeeds and increments balance with subsequent calls
        await button.connect(addr1).pressButton(options);
        expect(await button.getBalance()).to.equal(fee);

        await button.connect(addr2).pressButton(options);
        expect(await button.getBalance()).to.equal(2*fee);

        await button.connect(addr3).pressButton(options);
        expect(await button.getBalance()).to.equal(3*fee);

        // repeat press by address
        await expect(
            button.connect(addr3).pressButton(options)
        ).to.be.revertedWith('already pressed');

        // incorrect fee
        let optionsIncorrect = {value: ethers.utils.parseEther(".002")};
        await expect(
            button.connect(addr1).pressButton(optionsIncorrect)
        ).to.be.revertedWith('Incorrect fee sent');

        // check that it still works
        await button.connect(addr1).pressButton(options);
        expect(await button.getBalance()).to.equal(4*fee);
    });

    it("Check for correct behavior of claimTreasure()", async function () {
        await button.deployed();
        expect(await button.getBalance()).to.equal(0);
        let oldBalance = await addr3.getBalance(); // original balance of the winning address

        const options = {value: fee};
        await button.connect(addr1).pressButton(options);
        await button.connect(addr2).pressButton(options);
        await button.connect(addr3).pressButton(options);
        expect(await button.getBalance()).to.equal(3*fee); // check contract balance (one block mined)

        // claim attempt by wrong wallet (two blocks mined)
        await expect(
            button.connect(addr1).claimTreasure()
        ).to.be.revertedWith('nice try, but no');
        
        // premature claim attempt by wrong wallet (three blocks mined)
        await expect(
            button.connect(addr3).claimTreasure()
        ).to.be.revertedWith('Patience is bitter, but its fruit is sweet');
        
        // mine one more block and try again
        await hre.network.provider.send("evm_mine", []);
        await button.connect(addr3).claimTreasure();
        let newBalance = await addr3.getBalance();
        expect(newBalance.gt(oldBalance));
        expect(await button.getBalance()).to.equal(0);
    });
});