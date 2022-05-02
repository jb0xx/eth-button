//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

contract DegenButton {
    address private lastSeen; // initialized to 0x0 address
    uint lastBlockNumber;
    uint fee; // denominated in wei
    
    modifier onlyLastSeen {
        require(msg.sender == lastSeen, "nice try, but no");
        _;
    }

    // bad UX to allow the same user to press button twice in a row
    modifier notLastSeen { 
        require(msg.sender != lastSeen);
        _;
    }

    constructor(uint _fee) {
        console.log("Deploying a Button with fee: ", _fee);
        lastBlockNumber = block.number;
        fee = _fee;
    }
    
    function pressButton() external payable notLastSeen {
        require(msg.value == fee, "Incorrect fee sent");
        lastBlockNumber = block.number;
        lastSeen = msg.sender;
    }

    function claimTreasure() external onlyLastSeen {
        require(block.number - lastBlockNumber > 3, "Patience is bitter, but its fruit is sweet");  // no safe checks required given guarantees the block number is monotonically increasing
        (bool success, ) = msg.sender.call{value: address(this).balance}('');                       // // favor call rather than transfer/send to avoid gas-based failures; no need to gaurd against reentrancy since full balance is withdrawn anyways
        require(success);
        lastSeen = address(0);
    }

    function getBalance() public view returns (uint) {
        return address(this).balance;
    }
}

