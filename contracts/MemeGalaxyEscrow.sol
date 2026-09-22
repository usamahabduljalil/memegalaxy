// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Testnet escrow. The result signer is trusted to judge gameplay, not custody user funds.
contract MemeGalaxyEscrow is AccessControl, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant RESULT_ROLE = keccak256("RESULT_ROLE");
    bytes32 public constant RULESET = keccak256("memegalaxy-v2.0.0");
    mapping(uint256 => mapping(address => bytes32)) public controllers;
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");
    bytes32 public constant ENTRY_TYPEHASH = keccak256("Entry(uint256 epoch,address wallet,bytes32 userId,bytes32 controller,bytes32 ruleset,uint256 amount,uint256 nonce,uint256 expiry)");
    uint256 public constant ENTRY_FEE = 1e6;
    uint256 public constant MIN_POOL = 100e6;
    uint256 public constant MAX_POOL = 1000e6;
    uint256 public constant MIN_DEPOSIT = 1000e18;
    IERC20 public immutable galaxyToken;
    IERC20 public immutable usdc;
    address public immutable operations;
    bool public entriesPaused;
    uint256 public currentEpoch;
    uint256 public feeLiability;
    uint256 public prizeLiability;
    uint256 public operationsOwed;
    uint256 public tokenLiability;
    mapping(address => uint256) public nonces;
    enum Status { Missing, Registration, Running, Closed }
    enum ArenaStatus { Missing, Running, Valid, Invalid }
    struct Entry { uint256 amount; bytes32 userId; uint256 index; bool tokenClaimed; bool usdcClaimed; }
    struct Arena { uint256 budget; ArenaStatus status; address[3] winners; uint256 startedAt; }
    struct Epoch {
        Status status;
        uint256 registrationDeadline;
        uint256 matchDeadline;
        uint256 entropyBlock;
        uint256 endedAt;
        uint256 arenaCount;
        uint256 finishedCount;
        bytes32 commitment;
        bytes32 seed;
        address[] roster;
        mapping(address=>Entry) entries;
        mapping(bytes32=>address) identities;
        mapping(address=>uint256) arenaOf;
        mapping(uint256=>Arena) arenas;
        mapping(address=>uint256) rewards;
    }
    mapping(uint256=>Epoch) private epochs;
    event EpochOpened(uint256 indexed epoch, uint256 deadline, bytes32 commitment);
    event Registered(uint256 indexed epoch,address indexed wallet,bytes32 indexed userId,uint256 amount);
    event Cancelled(uint256 indexed epoch,address indexed wallet);
    event RolledOver(uint256 indexed epoch,uint256 deadline);
    event EpochStarted(uint256 indexed epoch,uint256 deadline,uint256 budget,bytes32 seed);
    event ArenaFinalized(uint256 indexed epoch,uint256 indexed arena,address[3] winners,bytes32 replayHash);
    event ArenaInvalidated(uint256 indexed epoch,uint256 indexed arena);
    event EpochClosed(uint256 indexed epoch,uint256 endedAt);
    event TokenReturned(uint256 indexed epoch,address indexed wallet,uint256 amount);
    event USDCPaid(uint256 indexed epoch,address indexed wallet,uint256 amount);

    constructor(address token,address stable,address admin,address operator,address registrar,address ops,address resultSigner) EIP712("MEMEGalaxy","2") {
        require(block.chainid==46630||block.chainid==31337,"TESTNET_ONLY");
        require(token!=address(0)&&stable!=address(0)&&admin!=address(0)&&operator!=address(0)&&registrar!=address(0)&&ops!=address(0)&&resultSigner!=address(0),"ZERO_ADDRESS");
        require(IERC20Metadata(token).decimals()==18&&IERC20Metadata(stable).decimals()==6,"DECIMALS");
        galaxyToken=IERC20(token);usdc=IERC20(stable);operations=ops;
        _grantRole(RESULT_ROLE,resultSigner);_grantRole(DEFAULT_ADMIN_ROLE,admin);_grantRole(OPERATOR_ROLE,operator);_grantRole(REGISTRAR_ROLE,registrar);
    }
    function pauseEntries(bool paused) external onlyRole(DEFAULT_ADMIN_ROLE){entriesPaused=paused;}
    function availablePrize() public view returns(uint256){return usdc.balanceOf(address(this))-feeLiability-prizeLiability-operationsOwed;}
    function openEpoch(bytes32 commitment) external onlyRole(OPERATOR_ROLE) returns(uint256 id){
        require(currentEpoch==0||epochs[currentEpoch].status==Status.Closed,"PREVIOUS_ACTIVE");require(commitment!=0,"COMMITMENT");
        id=++currentEpoch;Epoch storage e=epochs[id];e.status=Status.Registration;e.commitment=commitment;
        uint256 previousEnd=id>1?epochs[id-1].endedAt:block.timestamp;
        e.registrationDeadline=previousEnd+20 minutes;
        // After downtime, still provide a full registration window.
        if(e.registrationDeadline<=block.timestamp)e.registrationDeadline=block.timestamp+20 minutes;
        emit EpochOpened(id,e.registrationDeadline,commitment);
    }
    function register(uint256 id,bytes32 userId,bytes32 controller,uint256 amount,uint256 expiry,bytes calldata signature) external nonReentrant {
        Epoch storage e=epochs[id];require(!entriesPaused&&e.status==Status.Registration&&block.timestamp<e.registrationDeadline,"ENTRY_CLOSED");
        require(controller!=0&&amount>=MIN_DEPOSIT&&userId!=0&&block.timestamp<=expiry,"INVALID_ENTRY");require(e.roster.length<500&&e.entries[msg.sender].amount==0&&e.identities[userId]==address(0),"DUPLICATE_OR_FULL");
        bytes32 digest=_hashTypedDataV4(keccak256(abi.encode(ENTRY_TYPEHASH,id,msg.sender,userId,controller,RULESET,amount,nonces[msg.sender]++,expiry)));
        require(hasRole(REGISTRAR_ROLE,ECDSA.recover(digest,signature)),"AUTHORIZATION");
        uint256 beforeToken=galaxyToken.balanceOf(address(this));uint256 beforeUSDC=usdc.balanceOf(address(this));
        galaxyToken.safeTransferFrom(msg.sender,address(this),amount);usdc.safeTransferFrom(msg.sender,address(this),ENTRY_FEE);
        require(galaxyToken.balanceOf(address(this))-beforeToken==amount&&usdc.balanceOf(address(this))-beforeUSDC==ENTRY_FEE,"TRANSFER_TAX_UNSUPPORTED");
        controllers[id][msg.sender]=controller;e.entries[msg.sender]=Entry(amount,userId,e.roster.length,false,false);e.identities[userId]=msg.sender;e.roster.push(msg.sender);feeLiability+=ENTRY_FEE;tokenLiability+=amount;
        emit Registered(id,msg.sender,userId,amount);
    }
    function cancel(uint256 id) external nonReentrant {
        Epoch storage e=epochs[id];require(e.status==Status.Registration,"ALREADY_STARTED");Entry memory entry=e.entries[msg.sender];require(entry.amount>0,"NO_ENTRY");
        address last=e.roster[e.roster.length-1];e.roster[entry.index]=last;e.entries[last].index=entry.index;e.roster.pop();delete e.identities[entry.userId];delete e.entries[msg.sender];delete controllers[id][msg.sender];
        feeLiability-=ENTRY_FEE;tokenLiability-=entry.amount;galaxyToken.safeTransfer(msg.sender,entry.amount);usdc.safeTransfer(msg.sender,ENTRY_FEE);emit Cancelled(id,msg.sender);
    }
    function rollover(uint256 id) external {
        Epoch storage e=epochs[id];require(e.status==Status.Registration&&block.timestamp>=e.registrationDeadline,"NOT_DUE");
        require(e.roster.length<10||availablePrize()<MIN_POOL||entriesPaused,"READY_TO_START");
        e.registrationDeadline=block.timestamp+20 minutes;e.entropyBlock=0;emit RolledOver(id,e.registrationDeadline);
    }
    function requestEntropy(uint256 id) external onlyRole(OPERATOR_ROLE){
        Epoch storage e=epochs[id];require(!entriesPaused&&e.status==Status.Registration&&block.timestamp>=e.registrationDeadline&&e.roster.length>=10&&availablePrize()>=MIN_POOL,"NOT_READY");
        require(e.entropyBlock==0,"ENTROPY_ALREADY_REQUESTED");e.entropyBlock=block.number+2;
    }
    function startEpoch(uint256 id,bytes32 secret,address[] calldata orderedRoster) external onlyRole(OPERATOR_ROLE){
        Epoch storage e=epochs[id];require(!entriesPaused&&e.status==Status.Registration&&block.timestamp>=e.registrationDeadline,"NOT_DUE");
        require(keccak256(abi.encodePacked(secret))==e.commitment,"COMMITMENT");require(e.entropyBlock>0&&block.number>e.entropyBlock&&block.number-e.entropyBlock<=256,"ENTROPY_UNAVAILABLE");
        uint256 count=e.roster.length;require(count>=10&&count<=500&&orderedRoster.length==count,"COUNT");
        uint256 budget=availablePrize();require(budget>=MIN_POOL,"UNDERFUNDED");if(budget>MAX_POOL)budget=MAX_POOL;
        e.seed=keccak256(abi.encodePacked(secret,blockhash(e.entropyBlock)));e.arenaCount=(count+99)/100;e.matchDeadline=block.timestamp+2 hours;e.status=Status.Running;
        uint256 base=count/e.arenaCount;uint256 remainder=count%e.arenaCount;uint256 cursor;uint256 allocated;
        for(uint256 i=1;i<=e.arenaCount;i++){
            uint256 size=base+(i<=remainder?1:0);uint256 share=budget*size/count;
            e.arenas[i].budget=share;e.arenas[i].status=ArenaStatus.Running;e.arenas[i].startedAt=block.timestamp;allocated+=share;
            for(uint256 j=0;j<size;j++){address wallet=orderedRoster[cursor];require(e.entries[wallet].amount>0&&e.arenaOf[wallet]==0,"ROSTER");e.arenaOf[wallet]=i;e.roster[cursor++]=wallet;}
        }
        for(uint256 i=1;allocated<budget;i++){e.arenas[i].budget++;allocated++;}
        prizeLiability+=budget;emit EpochStarted(id,e.matchDeadline,budget,e.seed);
    }
    function abandonExpiredEntropy(uint256 id) external {
        Epoch storage e=epochs[id];require(e.status==Status.Registration&&e.entropyBlock>0&&block.number>e.entropyBlock+256,"NOT_EXPIRED");
        // Never reroll the same commitment/roster after seeing entropy: abandon and allow refunds.
        e.status=Status.Closed;e.endedAt=block.timestamp;emit EpochClosed(id,e.endedAt);
    }
    function finalizeArena(uint256 id,uint256 arena,address[3] calldata winners,bytes32 replayHash,uint256 endedAt) external onlyRole(RESULT_ROLE){
        Epoch storage e=epochs[id];Arena storage a=e.arenas[arena];require(e.status==Status.Running&&a.status==ArenaStatus.Running,"RESOLVED");require(block.timestamp<e.matchDeadline,"RECOVERY_DUE");
        require(endedAt>=a.startedAt&&endedAt<=e.matchDeadline&&endedAt<=block.timestamp,"END_TIME");
        for(uint256 i=0;i<3;i++){require(e.arenaOf[winners[i]]==arena&&winners[i]!=address(0),"RECIPIENT");for(uint256 j=0;j<i;j++)require(winners[i]!=winners[j],"DUPLICATE_WINNER");}
        a.status=ArenaStatus.Valid;a.winners=winners;uint256 second=a.budget*30/100;uint256 third=a.budget*20/100;
        e.rewards[winners[0]]=a.budget-second-third;e.rewards[winners[1]]=second;e.rewards[winners[2]]=third;
        uint256 count;for(uint256 i=0;i<e.roster.length;i++)if(e.arenaOf[e.roster[i]]==arena)count++;
        feeLiability-=count*ENTRY_FEE;operationsOwed+=count*ENTRY_FEE;
        if(endedAt>e.endedAt)e.endedAt=endedAt;emit ArenaFinalized(id,arena,winners,replayHash);_finish(id,e);
    }
    function invalidateArena(uint256 id,uint256 arena) external onlyRole(RESULT_ROLE){_invalidate(id,arena);}
    function recoverArena(uint256 id,uint256 arena) external {require(block.timestamp>=epochs[id].matchDeadline,"TOO_EARLY");_invalidate(id,arena);}
    function _invalidate(uint256 id,uint256 arena) internal {
        Epoch storage e=epochs[id];Arena storage a=e.arenas[arena];require(e.status==Status.Running&&a.status==ArenaStatus.Running,"RESOLVED");a.status=ArenaStatus.Invalid;prizeLiability-=a.budget;
        uint256 end=block.timestamp<e.matchDeadline?block.timestamp:e.matchDeadline;if(end>e.endedAt)e.endedAt=end;emit ArenaInvalidated(id,arena);_finish(id,e);
    }
    function _finish(uint256 id,Epoch storage e) internal {if(++e.finishedCount==e.arenaCount){e.status=Status.Closed;emit EpochClosed(id,e.endedAt);}}
    function claimToken(uint256 id,address wallet) external nonReentrant {
        Epoch storage e=epochs[id];Entry storage entry=e.entries[wallet];
        ArenaStatus state=e.arenas[e.arenaOf[wallet]].status;
        bool timedOut=e.status==Status.Running&&block.timestamp>=e.matchDeadline&&(state==ArenaStatus.Valid||state==ArenaStatus.Invalid);
        require((e.status==Status.Closed||timedOut)&&entry.amount>0&&!entry.tokenClaimed,"NOT_CLAIMABLE");entry.tokenClaimed=true;tokenLiability-=entry.amount;galaxyToken.safeTransfer(wallet,entry.amount);emit TokenReturned(id,wallet,entry.amount);
    }
    function claimUSDC(uint256 id,address wallet) external nonReentrant {
        Epoch storage e=epochs[id];Entry storage entry=e.entries[wallet];require(entry.amount>0&&!entry.usdcClaimed,"NOT_CLAIMABLE");
        ArenaStatus state=e.arenas[e.arenaOf[wallet]].status;uint256 amount;
        if(state==ArenaStatus.Invalid||(e.status==Status.Closed&&e.arenaCount==0)){amount=ENTRY_FEE;feeLiability-=ENTRY_FEE;}
        else {require(state==ArenaStatus.Valid,"UNRESOLVED");amount=e.rewards[wallet];prizeLiability-=amount;}
        entry.usdcClaimed=true;if(amount>0)usdc.safeTransfer(wallet,amount);emit USDCPaid(id,wallet,amount);
    }
    function payOperations() external nonReentrant {uint256 amount=operationsOwed;operationsOwed=0;usdc.safeTransfer(operations,amount);}
    function epochInfo(uint256 id) external view returns(Status status,uint256 deadline,uint256 matchDeadline,uint256 count,uint256 arenas,uint256 finished,bytes32 commitment,bytes32 seed,uint256 entropyBlock){Epoch storage e=epochs[id];return(e.status,e.registrationDeadline,e.matchDeadline,e.roster.length,e.arenaCount,e.finishedCount,e.commitment,e.seed,e.entropyBlock);}
    function roster(uint256 id) external view returns(address[] memory){return epochs[id].roster;}
    function entryInfo(uint256 id,address wallet) external view returns(uint256 amount,uint256 arena,uint256 reward,bool tokenClaimed,bool usdcClaimed){Epoch storage e=epochs[id];Entry storage v=e.entries[wallet];return(v.amount,e.arenaOf[wallet],e.rewards[wallet],v.tokenClaimed,v.usdcClaimed);}
    function arenaInfo(uint256 id,uint256 arena) external view returns(Arena memory){return epochs[id].arenas[arena];}
}
