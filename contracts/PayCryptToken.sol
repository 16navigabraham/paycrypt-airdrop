// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title PayCryptToken
 * @dev ERC20 token for the PayCrypt ecosystem
 * Features:
 * - Fixed supply of 1 billion tokens
 * - Burnable (deflationary mechanics)
 * - Pausable (emergency controls)
 * - Owner controls for initial distribution
 */
contract PayCryptToken is ERC20, ERC20Burnable, Ownable, Pausable {
    
    // ============ Constants ============
    
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 10**18; // 1 billion tokens
    uint256 public constant AIRDROP_ALLOCATION = 50_000_000 * 10**18; // 50M for airdrop (5%)
    uint256 public constant TEAM_ALLOCATION = 200_000_000 * 10**18; // 200M for team (20%)
    uint256 public constant TREASURY_ALLOCATION = 300_000_000 * 10**18; // 300M for treasury (30%)
    uint256 public constant LIQUIDITY_ALLOCATION = 150_000_000 * 10**18; // 150M for liquidity (15%)
    uint256 public constant ECOSYSTEM_ALLOCATION = 300_000_000 * 10**18; // 300M for ecosystem (30%)
    
    // ============ State Variables ============
    
    mapping(address => bool) public minters;
    mapping(address => uint256) public vestingSchedule;
    uint256 public teamTokensReleased;
    uint256 public teamVestingStart;
    uint256 public constant VESTING_DURATION = 2 * 365 days; // 2 years
    
    // ============ Events ============
    
    event MinterAdded(address indexed minter);
    event MinterRemoved(address indexed minter);
    event TokensVested(address indexed beneficiary, uint256 amount);
    event AirdropTokensMinted(address indexed airdropContract, uint256 amount);
    
    // ============ Errors ============
    
    error NotMinter();
    error VestingNotStarted();
    error NoTokensToVest();
    error ExceedsAllocation();
    
    // ============ Constructor ============
    
    constructor() ERC20("PayCrypt Token", "PCRYPT") {
        teamVestingStart = block.timestamp;
        
        // Mint initial allocations
        _mint(msg.sender, TREASURY_ALLOCATION); // Treasury to deployer
        _mint(msg.sender, LIQUIDITY_ALLOCATION); // Liquidity to deployer
        _mint(msg.sender, ECOSYSTEM_ALLOCATION); // Ecosystem to deployer
        
        // Team tokens are vested, so we mint them to this contract
        _mint(address(this), TEAM_ALLOCATION);
        
        // Airdrop tokens will be minted when needed
    }
    
    // ============ Modifiers ============
    
    modifier onlyMinter() {
        if (!minters[msg.sender] && msg.sender != owner()) {
            revert NotMinter();
        }
        _;
    }
    
    // ============ External Functions ============
    
    /**
     * @dev Mint tokens for airdrop contract
     * @param to Address to mint to (should be airdrop contract)
     * @param amount Amount to mint
     */
    function mintForAirdrop(address to, uint256 amount) external onlyMinter {
        if (totalSupply() + amount > TOTAL_SUPPLY) {
            revert ExceedsAllocation();
        }
        
        _mint(to, amount);
        emit AirdropTokensMinted(to, amount);
    }
    
    /**
     * @dev Release vested team tokens
     * @param beneficiary Team member to release tokens to
     */
    function releaseVestedTokens(address beneficiary) external onlyOwner {
        if (block.timestamp < teamVestingStart) {
            revert VestingNotStarted();
        }
        
        uint256 allocation = vestingSchedule[beneficiary];
        if (allocation == 0) {
            revert NoTokensToVest();
        }
        
        // Calculate vested amount
        uint256 elapsed = block.timestamp - teamVestingStart;
        uint256 vestedAmount;
        
        if (elapsed >= VESTING_DURATION) {
            // Fully vested
            vestedAmount = allocation;
        } else {
            // Partially vested (linear)
            vestedAmount = (allocation * elapsed) / VESTING_DURATION;
        }
        
        // Calculate releasable amount (vested - already released)
        uint256 releasableAmount = vestedAmount - vestingSchedule[beneficiary];
        
        if (releasableAmount == 0) {
            revert NoTokensToVest();
        }
        
        // Update state
        vestingSchedule[beneficiary] += releasableAmount;
        teamTokensReleased += releasableAmount;
        
        // Transfer tokens
        _transfer(address(this), beneficiary, releasableAmount);
        
        emit TokensVested(beneficiary, releasableAmount);
    }
    
    /**
     * @dev Add vesting schedule for team member
     * @param beneficiary Team member address
     * @param amount Amount of tokens to vest
     */
    function addVestingSchedule(address beneficiary, uint256 amount) external onlyOwner {
        vestingSchedule[beneficiary] = amount;
    }
    
    /**
     * @dev Add minter (for airdrop contracts, etc.)
     * @param minter Address to add as minter
     */
    function addMinter(address minter) external onlyOwner {
        minters[minter] = true;
        emit MinterAdded(minter);
    }
    
    /**
     * @dev Remove minter
     * @param minter Address to remove as minter
     */
    function removeMinter(address minter) external onlyOwner {
        minters[minter] = false;
        emit MinterRemoved(minter);
    }
    
    /**
     * @dev Pause token transfers (emergency)
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev Unpause token transfers
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    // ============ View Functions ============
    
    /**
     * @dev Get vested amount for a beneficiary
     * @param beneficiary Address to check
     * @return vestedAmount Amount vested so far
     * @return releasableAmount Amount that can be released now
     */
    function getVestedAmount(address beneficiary) 
        external 
        view 
        returns (uint256 vestedAmount, uint256 releasableAmount) 
    {
        uint256 allocation = vestingSchedule[beneficiary];
        if (allocation == 0 || block.timestamp < teamVestingStart) {
            return (0, 0);
        }
        
        uint256 elapsed = block.timestamp - teamVestingStart;
        
        if (elapsed >= VESTING_DURATION) {
            vestedAmount = allocation;
        } else {
            vestedAmount = (allocation * elapsed) / VESTING_DURATION;
        }
        
        releasableAmount = vestedAmount - vestingSchedule[beneficiary];
    }
    
    /**
     * @dev Get token allocation breakdown
     * @return airdrop Airdrop allocation
     * @return team Team allocation  
     * @return treasury Treasury allocation
     * @return liquidity Liquidity allocation
     * @return ecosystem Ecosystem allocation
     */
    function getAllocations() 
        external 
        pure 
        returns (
            uint256 airdrop,
            uint256 team,
            uint256 treasury,
            uint256 liquidity,
            uint256 ecosystem
        ) 
    {
        return (
            AIRDROP_ALLOCATION,
            TEAM_ALLOCATION,
            TREASURY_ALLOCATION,
            LIQUIDITY_ALLOCATION,
            ECOSYSTEM_ALLOCATION
        );
    }
    
    /**
     * @dev Get current supply statistics
     * @return circulating Circulating supply (total - team locked)
     * @return locked Team tokens still locked
     * @return burned Tokens burned
     */
    function getSupplyStats() 
        external 
        view 
        returns (
            uint256 circulating,
            uint256 locked,
            uint256 burned
        ) 
    {
        uint256 current = totalSupply();
        locked = balanceOf(address(this)); // Team tokens in contract
        circulating = current - locked;
        burned = TOTAL_SUPPLY - current;
    }
    
    // ============ Internal Functions ============
    
    /**
     * @dev Override transfer to add pause functionality
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, amount);
    }
    
    /**
     * @dev Override decimals to return 18 (standard)
     */
    function decimals() public pure override returns (uint8) {
        return 18;
    }
}