// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
contract GalaxyHuntVault is AccessControl, ReentrancyGuard {
 using SafeERC20 for IERC20;
 bytes32 public constant PUBLISHER_ROLE=keccak256("PUBLISHER_ROLE");
 struct Allocation {bytes32 root;uint256 remaining;}
 mapping(address=>mapping(uint256=>Allocation)) public allocations;
 mapping(address=>uint256) public liability;
 mapping(bytes32=>bool) public claimed;
 event Published(address indexed asset,uint256 indexed week,bytes32 root,uint256 total);
 event Claimed(address indexed asset,uint256 indexed week,uint256 index,address wallet,uint256 amount);
 constructor(address admin,address publisher){require(block.chainid==46630||block.chainid==31337,"TESTNET_ONLY");require(admin!=address(0)&&publisher!=address(0),"ZERO");_grantRole(DEFAULT_ADMIN_ROLE,admin);_grantRole(PUBLISHER_ROLE,publisher);}
 function publish(address asset,uint256 week,bytes32 root,uint256 total) external onlyRole(PUBLISHER_ROLE){
  require(asset!=address(0)&&root!=bytes32(0)&&total>0,"INVALID");
  // Monday 00:00 Africa/Lagos is Sunday 23:00 UTC; Unix epoch was Thursday.
  require((week+3600+3 days)%7 days==0&&block.timestamp>=week+7 days,"WEEK_LOCKED");
  require(allocations[asset][week].root==bytes32(0),"IMMUTABLE");
  require(IERC20(asset).balanceOf(address(this))>=liability[asset]+total,"UNFUNDED");
  allocations[asset][week]=Allocation(root,total);liability[asset]+=total;emit Published(asset,week,root,total);
 }
 function claim(address asset,uint256 week,uint256 index,address wallet,uint256 amount,bytes32[] calldata proof) external nonReentrant {
  Allocation storage a=allocations[asset][week];bytes32 key=keccak256(abi.encode(asset,week,index));
  require(!claimed[key]&&wallet!=address(0)&&amount>0,"INVALID_CLAIM");
  bytes32 leaf=keccak256(bytes.concat(keccak256(abi.encode(block.chainid,address(this),asset,week,index,wallet,amount))));
  require(MerkleProof.verifyCalldata(proof,a.root,leaf)&&a.root!=bytes32(0),"PROOF");
  require(amount<=a.remaining,"ALLOCATION");claimed[key]=true;a.remaining-=amount;liability[asset]-=amount;
  IERC20(asset).safeTransfer(wallet,amount);emit Claimed(asset,week,index,wallet,amount);
 }
}
