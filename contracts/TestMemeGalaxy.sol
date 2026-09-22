// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
contract TestMemeGalaxy is ERC20 {
    constructor(address recipient) ERC20("MEMEGalaxy Test Token", "MEMEGALAXY") {
        require(block.chainid == 46630 || block.chainid == 31337, "TESTNET_ONLY");
        _mint(recipient, 1_000_000_000e18);
    }
}
contract MemeGalaxyFaucet {
    using SafeERC20 for IERC20;
    IERC20 public immutable token;
    IERC20 public immutable stable;
    mapping(address=>uint256) public nextClaim;
    constructor(address asset,address testUSDC){require(block.chainid==46630||block.chainid==31337,"TESTNET_ONLY");token=IERC20(asset);stable=IERC20(testUSDC);}
    function claim() external {require(block.timestamp>=nextClaim[msg.sender],"WAIT_24_HOURS");nextClaim[msg.sender]=block.timestamp+1 days;token.safeTransfer(msg.sender,10000e18);stable.safeTransfer(msg.sender,20e6);}
}
contract TestGalaxyUSDC is ERC20 {
    constructor() ERC20("MEMEGalaxy TEST USDC", "tUSDC") {require(block.chainid==46630||block.chainid==31337,"TESTNET_ONLY");_mint(msg.sender,10_000_000e6);}
    function decimals() public pure override returns(uint8){return 6;}
}
