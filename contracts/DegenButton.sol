//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract DegenButton is Ownable {
    struct Parameters {
        uint128 fee;        // fee per button press (in Gwei)
        uint64 blockDelay;  // number of blocks that must pass before a prize is claimed
        uint16 houseCut;    // percent of the pool set aside for the DAO
        uint16 seedCut;     // percent of the rewards set aside for seeding the next round
    }

    struct Balances {
        uint prizePool;     // prize pool to be distributed to the winner
        uint128 seedFund;   // funds allocated to seed the next round
        uint128 houseFund;  // the house's cut
    }

    address lastClicked;    // initialized to 0x0 address
    uint lastBlockNumber;   // initial value doesn't matter since only lastClicked can claimTreasure()
    Balances balances;      // self explanatory
    Parameters currParams;  // current value of the game's parameters
    Parameters nextParams;  // parameters values to update to in the next round
    
    modifier onlyLastClicked {
        require(msg.sender == lastClicked, "nice try, but no");
        _;
    }

    // bad UX to allow the same user to press button twice in a row
    modifier notLastClicked { 
        require(msg.sender != lastClicked, "already pressed");
        _;
    }

    constructor(uint128 _fee, uint64 _blockDelay, uint16 _houseCut, uint16 _seedCut) {
        console.log("Deploying a Button with fee: ", _fee);
        nextParams.fee = _fee;
        nextParams.blockDelay = _blockDelay;
        nextParams.houseCut = _houseCut;
        nextParams.seedCut = _seedCut;
        updateParams();
    }
    
    
    /*************************
     * PLAYER INTERACTIONS
     *************************/
    
    /*
     * @dev presses the button by sending fee, grants the clicker exclusive
     * rights to claim prize, until they are griefed by the next clicker
     */
    function pressButton() external payable notLastClicked {
        require(msg.value > currParams.fee, "Insufficient fee sent");
        uint128 seedInc = uint128(currParams.seedCut * msg.value);
        uint128 houseInc = uint128(currParams.houseCut * msg.value);
        balances.seedFund += seedInc;
        balances.houseFund += houseInc;
        balances.prizePool += (msg.value - seedInc - houseInc);
        lastBlockNumber = block.number;
        lastClicked = msg.sender;
    }

    /*
     * @dev claims the prize pool, access only granted if the caller is the
     * last clicker and enough blocks have been mined
     */
    function claimTreasure() external payable onlyLastClicked {
        require(
            block.number - lastBlockNumber >= currParams.blockDelay,
            "Patience is bitter, but its fruit is sweet"
        );     // block number should be monotonically increasing
        lastClicked = address(0);
        (bool success, ) = msg.sender.call{value: balances.prizePool}('');  // is there a need to gaurd against reentrancy?
        require(success);
        updateParams();
    }

    /*
     * @dev by the goodness of their heart, a user has decided to act as the
     * great  benefactor of the current round. Likely this will just be called
     * by the owner, but by all means you're more than welcome to help enable
     * this degeneracy.
     */
    function seedCurrentRound() external payable {
        balances.prizePool += msg.value;
    }


    /*************************
     * OWNER FUNCTIONS (eventually will be the DAO)
     *************************/

    /*
     * @dev updates the seed cut starting next round
     */
    function updateSeedCut(uint16 _cut) external onlyOwner {
        require(_cut + nextParams.houseCut < 100, "seed and house cut cannot exceed 100%");
        nextParams.seedCut = _cut;
    }

    /*
     * @dev updates the house's cut starting next round
     */
    function updateHouseCut(uint16 _cut) external onlyOwner {
        require(_cut + nextParams.seedCut < 100, "seed and house cut cannot exceed 100%");
        nextParams.houseCut = _cut;
    }

    /*
     * @dev sends a portion of the housefunds to the recipient address
     */
    function sendFunds(address _recipient, uint amt) payable external onlyOwner {
        require(balances.houseFund < amt, "insufficient ETH");
        (bool success, ) = _recipient.call{value: amt}(''); 
        require(success);
    }

    /*
     * @dev sends a portion of the housefunds to the recipient address
     *   Q: can we just call sendFunds(msg.sender) here?
     */
    function withdraw(uint amt) payable external onlyOwner {
        require(balances.houseFund < amt, "insufficient ETH");
        (bool success, ) = msg.sender.call{value: amt}('');
        require(success);
    }


    /*************************
     * VIEW FUNCTIONS
     *   Q: can we aggregate some of these calls?
     *************************/
    function getBalance() public view returns (uint) {
        return address(this).balance;
    }

    function getPrizePool() public view returns (uint) {
        return balances.prizePool;
    }

    function getSeedFund() public view returns (uint) {
        return balances.seedFund;
    }

    function getHouseFund() public view returns (uint) {
        return balances.houseFund;
    }

    function getButtonFee() public view returns (uint) {
        return currParams.fee;
    }

    function getLastClicked() public view returns (address) {
        return lastClicked;
    }

    function getLastBlockNumber() public view returns (uint) {
        return lastBlockNumber;
    }


    /*************************
     * INTERNAL FUNCTIONS
     *************************/

    /*
     * @dev updates the current parameters to reflect the ones queued
     *  leaves nextParams unchanged
     */
    function updateParams() internal {
        currParams.fee = nextParams.fee;
        currParams.blockDelay = nextParams.blockDelay;
        currParams.houseCut = nextParams.houseCut;
        currParams.seedCut = nextParams.seedCut;
    }
}

