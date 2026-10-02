// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
/** Tokens held here cannot be withdrawn. Retirement does not change ERC20 totalSupply. */
contract GalaxyRetirement is AccessControl,ReentrancyGuard,EIP712 {
 using SafeERC20 for IERC20;
 bytes32 public constant QUOTER_ROLE=keccak256("QUOTER_ROLE");
 bytes32 private constant TYPEHASH=keccak256("Retire(bytes32 id,address wallet,bytes32 owner,uint256 amount,uint256 credits,uint256 version,uint256 expiry)");
 IERC20 public immutable token;uint256 public rateVersion;bool public enabled;
 mapping(bytes32=>bool) public used;
 event Retired(bytes32 indexed id,address indexed wallet,bytes32 indexed owner,uint256 amount,uint256 credits,uint256 version);
 constructor(address asset,address admin,address quoter) EIP712("GalaxyRetirement","1"){require(block.chainid==46630||block.chainid==31337,"TESTNET_ONLY");require(asset!=address(0)&&admin!=address(0)&&quoter!=address(0),"ZERO");token=IERC20(asset);_grantRole(DEFAULT_ADMIN_ROLE,admin);_grantRole(QUOTER_ROLE,quoter);}
 function configure(uint256 version,bool active) external onlyRole(DEFAULT_ADMIN_ROLE){require(version>rateVersion,"VERSION");rateVersion=version;enabled=active;}
 function retire(bytes32 id,bytes32 owner,uint256 amount,uint256 credits,uint256 version,uint256 expiry,bytes calldata signature) external nonReentrant {
  require(enabled&&version==rateVersion&&block.timestamp<=expiry&&!used[id]&&amount>0&&credits>0&&owner!=bytes32(0),"QUOTE");
  bytes32 digest=_hashTypedDataV4(keccak256(abi.encode(TYPEHASH,id,msg.sender,owner,amount,credits,version,expiry)));
  require(hasRole(QUOTER_ROLE,ECDSA.recover(digest,signature)),"SIGNER");used[id]=true;
  uint256 beforeBalance=token.balanceOf(address(this));token.safeTransferFrom(msg.sender,address(this),amount);
  require(token.balanceOf(address(this))-beforeBalance==amount,"TRANSFER_TAX");emit Retired(id,msg.sender,owner,amount,credits,version);
 }
}
