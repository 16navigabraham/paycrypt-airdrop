// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title PayCryptAirdrop
 * @dev Merkle tree-based airdrop contract for efficient token distribution
 * Supports multiple claim rounds and anti-gaming mechanisms
 */
contract PayCryptAirdrop is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    // ============ State Variables ============
    
    IERC20 public immutable token;
    bytes32 public merkleRoot;
    uint256 public claimPeriodEnd;
    uint256 public totalClaimable;
    uint256 public totalClaimed;
    
    // Tracking claimed addresses
    mapping(address => bool) public hasClaimed;
    mapping(address => uint256) public claimedAmount;
    
    // ============ Events ============
    
    event TokensClaimed(
        address indexed claimer,
        uint256 amount,
        uint256 timestamp
    );
    
    event AirdropUpdated(
        bytes32 newMerkleRoot,
        uint256 newClaimPeriodEnd,
        uint256 totalTokens
    );
    
    event EmergencyWithdraw(
        address indexed owner,
        uint256 amount
    );
    
    // ============ Errors ============
    
    error ClaimPeriodEnded();
    error ClaimPeriodNotStarted();
    error AlreadyClaimed();
    error InvalidProof();
    error InvalidAmount();
    error InsufficientTokens();
    error ZeroAddress();
    
    // ============ Constructor ============
    
    constructor(
        address _token,
        bytes32 _merkleRoot,
        uint256 _claimPeriodEnd,
        uint256 _totalClaimable
    ) {
        if (_token == address(0)) revert ZeroAddress();
        if (_claimPeriodEnd <= block.timestamp) revert ClaimPeriodEnded();
        
        token = IERC20(_token);
        merkleRoot = _merkleRoot;
        claimPeriodEnd = _claimPeriodEnd;
        totalClaimable = _totalClaimable;
    }
    
    // ============ External Functions ============
    
    /**
     * @dev Claim tokens using merkle proof
     * @param amount Amount of tokens to claim
     * @param merkleProof Proof that the user is eligible
     */
    function claimTokens(
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external nonReentrant {
        // Validation checks
        if (block.timestamp > claimPeriodEnd) revert ClaimPeriodEnded();
        if (hasClaimed[msg.sender]) revert AlreadyClaimed();
        if (amount == 0) revert InvalidAmount();
        
        // Verify merkle proof
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, amount));
        if (!MerkleProof.verify(merkleProof, merkleRoot, leaf)) {
            revert InvalidProof();
        }
        
        // Check if enough tokens available
        if (totalClaimed + amount > totalClaimable) {
            revert InsufficientTokens();
        }
        
        // Update state
        hasClaimed[msg.sender] = true;
        claimedAmount[msg.sender] = amount;
        totalClaimed += amount;
        
        // Transfer tokens
        token.safeTransfer(msg.sender, amount);
        
        emit TokensClaimed(msg.sender, amount, block.timestamp);
    }
    
    /**
     * @dev Check if an address can claim tokens
     * @param user Address to check
     * @param amount Amount they're trying to claim
     * @param merkleProof Proof of eligibility
     * @return eligible True if user can claim
     */
    function canClaim(
        address user,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external view returns (bool eligible) {
        // Check basic conditions
        if (block.timestamp > claimPeriodEnd) return false;
        if (hasClaimed[user]) return false;
        if (amount == 0) return false;
        if (totalClaimed + amount > totalClaimable) return false;
        
        // Verify merkle proof
        bytes32 leaf = keccak256(abi.encodePacked(user, amount));
        return MerkleProof.verify(merkleProof, merkleRoot, leaf);
    }
    
    /**
     * @dev Get claim status for a user
     * @param user Address to check
     * @return claimed Whether user has claimed
     * @return amount Amount claimed (0 if not claimed)
     * @return canStillClaim Whether user can still claim
     */
    function getClaimStatus(address user) 
        external 
        view 
        returns (
            bool claimed,
            uint256 amount,
            bool canStillClaim
        ) 
    {
        claimed = hasClaimed[user];
        amount = claimedAmount[user];
        canStillClaim = !claimed && block.timestamp <= claimPeriodEnd;
    }
    
    /**
     * @dev Get airdrop statistics
     * @return _totalClaimable Total tokens available
     * @return _totalClaimed Total tokens claimed so far
     * @return _remainingTokens Tokens still available
     * @return _claimPeriodEnd When claim period ends
     * @return _isActive Whether airdrop is currently active
     */
    function getAirdropStats() 
        external 
        view 
        returns (
            uint256 _totalClaimable,
            uint256 _totalClaimed,
            uint256 _remainingTokens,
            uint256 _claimPeriodEnd,
            bool _isActive
        ) 
    {
        _totalClaimable = totalClaimable;
        _totalClaimed = totalClaimed;
        _remainingTokens = totalClaimable - totalClaimed;
        _claimPeriodEnd = claimPeriodEnd;
        _isActive = block.timestamp <= claimPeriodEnd;
    }
    
    // ============ Owner Functions ============
    
    /**
     * @dev Update airdrop parameters (emergency use)
     * @param _merkleRoot New merkle root
     * @param _claimPeriodEnd New claim period end
     * @param _totalClaimable New total claimable amount
     */
    function updateAirdrop(
        bytes32 _merkleRoot,
        uint256 _claimPeriodEnd,
        uint256 _totalClaimable
    ) external onlyOwner {
        if (_claimPeriodEnd <= block.timestamp) revert ClaimPeriodEnded();
        
        merkleRoot = _merkleRoot;
        claimPeriodEnd = _claimPeriodEnd;
        totalClaimable = _totalClaimable;
        
        emit AirdropUpdated(_merkleRoot, _claimPeriodEnd, _totalClaimable);
    }
    
    /**
     * @dev Emergency withdraw unclaimed tokens after claim period
     */
    function emergencyWithdraw() external onlyOwner {
        if (block.timestamp <= claimPeriodEnd) revert ClaimPeriodNotStarted();
        
        uint256 remainingBalance = token.balanceOf(address(this));
        if (remainingBalance > 0) {
            token.safeTransfer(owner(), remainingBalance);
            emit EmergencyWithdraw(owner(), remainingBalance);
        }
    }
    
    /**
     * @dev Extend claim period (emergency use)
     * @param newEndTime New end timestamp
     */
    function extendClaimPeriod(uint256 newEndTime) external onlyOwner {
        if (newEndTime <= claimPeriodEnd) revert InvalidAmount();
        claimPeriodEnd = newEndTime;
    }
}