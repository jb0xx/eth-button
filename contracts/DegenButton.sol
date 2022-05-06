//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract DegenButton is Ownable {
    event Deploy(uint128 _fee, uint64 _blockDelay, uint16 _houseCut, uint16 _seedCut);
    event Press(address _degen);
    event Claim(address _winner, uint _prize);

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
    uint lastBlockNumber;   // initial value doesn't matter since only lastClicked can claimPrize()
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
        emit Deploy(_fee, _blockDelay, _houseCut, _seedCut);
    }
    
    
    /*************************
     * PLAYER INTERACTIONS
     *************************/
    
    /*
     * @dev presses the button by sending fee, grants the clicker exclusive
     * rights to claim prize, until they are griefed by the next clicker
     */
    function pressButton() external payable notLastClicked {
        require(msg.value >= currParams.fee, "Insufficient fee sent");
        uint128 seedInc = uint128(currParams.seedCut * msg.value / 100);
        uint128 houseInc = uint128(currParams.houseCut * msg.value / 100);
        balances.seedFund += seedInc;
        balances.houseFund += houseInc;
        balances.prizePool += (msg.value - seedInc - houseInc);
        lastBlockNumber = block.number;
        lastClicked = msg.sender;
        emit Press(msg.sender);
    }

    /*
     * @dev claims the prize pool, access only granted if the caller is the
     * last clicker and enough blocks have been mined
     */
    function claimPrize() external payable onlyLastClicked {
        require(
            block.number - lastBlockNumber >= currParams.blockDelay,
            "Patience is bitter, but its fruit is sweet"
        );     // block number should be monotonically increasing
        lastClicked = address(0);
        uint prize = balances.prizePool;
        balances.prizePool = 0;
        (bool success, ) = msg.sender.call{value: prize}('');  // is there a need to gaurd against reentrancy?
        require(success);
        updateParams();
        emit Claim(msg.sender, prize);
    }

    /*
     * @dev by the goodness of their heart, a user has decided to act as the
     * great benefactor of the current round. Likely this will just be called
     * by the owner, but by all means, you're more than welcome to help enable
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
     *************************/

    function getBalance() external view returns (uint) {
        return address(this).balance;
    }

    function getPrizePool() external view returns (uint) {
        return balances.prizePool;
    }

    function getSeedFund() external view returns (uint) {
        return balances.seedFund;
    }

    function getHouseFund() external view returns (uint) {
        return balances.houseFund;
    }

    function getCurrParams() external view returns (Parameters memory) {
        return currParams;
    }
    
    function getNextParams() external view returns (Parameters memory) {
        return nextParams;
    }
    
    /*
     * @dev last address to have clicked the button
     */
    function getLastClicked() external view returns (address) {
        return lastClicked;
    }

    /*
     * @dev Block Number during which the button was clicked last
     */
    function getLastBlockNumber() external view returns (uint) {
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

