// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
contract TestDominate is ERC20 {
    constructor(address recipient) ERC20("TEST ONLY DOMINATE","tDOMINATE") {require(block.chainid==5042002||block.chainid==31337,"TESTNET_ONLY");_mint(recipient,1_000_000_000e18);}
}
contract DominateFaucet {
    using SafeERC20 for IERC20;
    IERC20 public immutable token;
    mapping(address=>uint256) public nextClaim;
    constructor(address asset){require(block.chainid==5042002||block.chainid==31337,"TESTNET_ONLY");token=IERC20(asset);}
    function claim() external {require(block.timestamp>=nextClaim[msg.sender],"WAIT_24_HOURS");nextClaim[msg.sender]=block.timestamp+1 days;token.safeTransfer(msg.sender,10000e18);}
}
