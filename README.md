# Welcome to r/button.eth

This is a basic project to implement r/button functionality on a Solidity contract. It allows users to call `pressButton()` by depositing the set fee into the contract. If 3 blocks have been mined since the last press, the last user to press the button is able to call `claimTreasure()` to claim all deposited funds. Good luck deploying this without bots starting a war over it. Maybe introduce a fee on the prizepool to profit?

Relevant code can be found in `contracts/DegenButton.sol` and `tests/button-test.js`

To run, clone this repo then run:
```shell
yarn install
npx hardhat test
```
