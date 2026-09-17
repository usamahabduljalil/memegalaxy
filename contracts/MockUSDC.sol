// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
contract MockUSDC is ERC20 {
    mapping(address=>bool) public blocked;
    address private immutable controller=msg.sender;
    function setBlocked(address recipient,bool value) external {require(msg.sender==controller,"TEST_CONTROLLER");blocked[recipient]=value;}
    function _update(address from,address to,uint256 value) internal override {require(!blocked[to],"TEST_RECIPIENT_BLOCKED");super._update(from,to,value);}
    constructor() ERC20("LOCAL TEST USDC","USDC"){require(block.chainid==31337,"LOCAL_ONLY");_mint(msg.sender,1_000_000e6);}
    function decimals() public pure override returns(uint8){return 6;}
}
