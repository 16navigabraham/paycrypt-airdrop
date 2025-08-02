import { ethers } from 'ethers';
import { MerkleTree } from 'merkletreejs';
import * as fs from 'fs';

// Types
interface EligibleUser {
  address: string;
  amount: string; // In ether (e.g., "1000" for 1000 tokens)
  reason?: string; // Why they're eligible
}

// Mock eligible users data
// In real implementation, this would come from:
// - PayCrypt early users
// - Community contributors  
// - Beta testers
// - Social media participants
const ELIGIBLE_USERS: EligibleUser[] = [
  {
    address: "0x742d35Cc6661C0532108D3CE8c8FCfb4F88CA7C5",
    amount: "1000",
    reason: "Early PayCrypt user"
  },
  {
    address: "0x8ba1f109551bD432803012645Hac136c",
    amount: "500", 
    reason: "Beta tester"
  },
  {
    address: "0x2546BcD3c84621e976D8185a91A922aE77ECEc30",
    amount: "2000",
    reason: "Community contributor"
  },
  {
    address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    amount: "750",
    reason: "Social media supporter"
  },
  {
    address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    amount: "1500",
    reason: "Ecosystem partner"
  }
  // Add more eligible addresses here
];

/**
 * Generate Merkle tree for airdrop eligibility
 */
export class AirdropMerkleTree {
  private tree: MerkleTree;
  private eligibleUsers: EligibleUser[];
  
  constructor(users: EligibleUser[]) {
    this.eligibleUsers = users;
    this.tree = this.generateMerkleTree();
  }
  
  /**
   * Create leaf hash for a user
   */
  private createLeaf(address: string, amount: string): Buffer {
    // Convert amount to wei
    const amountWei = ethers.parseEther(amount);
    
    // Create hash of address + amount (same as in smart contract)
    const hash = ethers.solidityPackedKeccak256(
      ['address', 'uint256'],
      [address, amountWei]
    );
    
    return Buffer.from(hash.slice(2), 'hex');
  }
  
  /**
   * Generate the Merkle tree
   */
  private generateMerkleTree(): MerkleTree {
    // Create leaves
    const leaves = this.eligibleUsers.map(user => 
      this.createLeaf(user.address, user.amount)
    );
    
    // Create tree using keccak256 hash function
    const tree = new MerkleTree(leaves, ethers.keccak256, { 
      sortPairs: true 
    });
    
    return tree;
  }
  
  /**
   * Get Merkle root
   */
  getMerkleRoot(): string {
    return this.tree.getHexRoot();
  }
  
  /**
   * Get proof for a specific address
   */
  getProof(address: string, amount: string): string[] {
    const leaf = this.createLeaf(address, amount);
    const proof = this.tree.getHexProof(leaf);
    return proof;
  }
  
  /**
   * Verify a proof
   */
  verifyProof(address: string, amount: string, proof: string[]): boolean {
    const leaf = this.createLeaf(address, amount);
    return this.tree.verify(proof, leaf, this.getMerkleRoot());
  }
  
  /**
   * Get all eligible users with their proofs
   */
  getAllEligibleWithProofs() {
    return this.eligibleUsers.map(user => ({
      address: user.address,
      amount: user.amount,
      amountWei: ethers.parseEther(user.amount).toString(),
      proof: this.getProof(user.address, user.amount),
      reason: user.reason
    }));
  }
  
  /**
   * Get statistics
   */
  getStats() {
    const totalUsers = this.eligibleUsers.length;
    const totalTokens = this.eligibleUsers.reduce(
      (sum, user) => sum + parseFloat(user.amount), 
      0
    );
    
    return {
      totalEligibleUsers: totalUsers,
      totalTokensToDistribute: totalTokens,
      merkleRoot: this.getMerkleRoot(),
      treeHeight: this.tree.getDepth()
    };
  }
}

/**
 * Generate airdrop data and save to files
 */
async function generateAirdropData() {
  console.log('🌱 Generating Merkle tree for PayCrypt airdrop...');
  
  // Create Merkle tree
  const airdropTree = new AirdropMerkleTree(ELIGIBLE_USERS);
  
  // Get statistics
  const stats = airdropTree.getStats();
  console.log('\n📊 Airdrop Statistics:');
  console.log(`- Eligible users: ${stats.totalEligibleUsers}`);
  console.log(`- Total tokens: ${stats.totalTokensToDistribute.toLocaleString()}`);
  console.log(`- Merkle root: ${stats.merkleRoot}`);
  console.log(`- Tree height: ${stats.treeHeight}`);
  
  // Get all users with proofs
  const eligibleWithProofs = airdropTree.getAllEligibleWithProofs();
  
  // Create output directory
  const outputDir = './airdrop-data';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }
  
  // Save merkle root and stats
  const deploymentData = {
    merkleRoot: stats.merkleRoot,
    totalTokens: stats.totalTokensToDistribute,
    totalUsers: stats.totalEligibleUsers,
    claimPeriodDays: 30, // 30 days to claim
    generatedAt: new Date().toISOString()
  };
  
  fs.writeFileSync(
    `${outputDir}/deployment-config.json`,
    JSON.stringify(deploymentData, null, 2)
  );
  
  // Save eligible addresses with proofs (for frontend)
  const frontendData = eligibleWithProofs.reduce((acc, user) => {
    acc[user.address.toLowerCase()] = {
      address: user.address,
      amount: user.amountWei,
      proof: user.proof
    };
    return acc;
  }, {} as Record<string, any>);
  
  fs.writeFileSync(
    `${outputDir}/eligible-addresses.json`,
    JSON.stringify(frontendData, null, 2)
  );
  
  // Save detailed list (for verification)
  fs.writeFileSync(
    `${outputDir}/eligible-users-detailed.json`,
    JSON.stringify(eligibleWithProofs, null, 2)
  );
  
  // Generate deployment script
  const deploymentScript = `
// Deployment configuration for PayCrypt Airdrop
export const AIRDROP_CONFIG = {
  MERKLE_ROOT: "${stats.merkleRoot}",
  TOTAL_TOKENS: "${ethers.parseEther(stats.totalTokensToDistribute.toString())}",
  CLAIM_PERIOD_DAYS: 30,
  TOKEN_NAME: "PayCrypt Token",
  TOKEN_SYMBOL: "PCRYPT"
};

// Deployment function
async function deployAirdrop() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying airdrop with account:", deployer.address);
  
  // Deploy token first (if needed)
  const Token = await ethers.getContractFactory("PayCryptToken");
  const token = await Token.deploy();
  await token.waitForDeployment();
  console.log("Token deployed to:", await token.getAddress());
  
  // Deploy airdrop contract
  const claimPeriodEnd = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days
  
  const Airdrop = await ethers.getContractFactory("PayCryptAirdrop");
  const airdrop = await Airdrop.deploy(
    await token.getAddress(),
    AIRDROP_CONFIG.MERKLE_ROOT,
    claimPeriodEnd,
    AIRDROP_CONFIG.TOTAL_TOKENS
  );
  await airdrop.waitForDeployment();
  console.log("Airdrop deployed to:", await airdrop.getAddress());
  
  // Transfer tokens to airdrop contract
  await token.transfer(await airdrop.getAddress(), AIRDROP_CONFIG.TOTAL_TOKENS);
  console.log("Tokens transferred to airdrop contract");
}
`;
  
  fs.writeFileSync(`${outputDir}/deploy.ts`, deploymentScript);
  
  console.log('\n✅ Files generated:');
  console.log(`- ${outputDir}/deployment-config.json`);
  console.log(`- ${outputDir}/eligible-addresses.json`);
  console.log(`- ${outputDir}/eligible-users-detailed.json`);
  console.log(`- ${outputDir}/deploy.ts`);
  
  // Verify some proofs
  console.log('\n🔍 Verifying proofs for first 3 users:');
  for (let i = 0; i < Math.min(3, eligibleWithProofs.length); i++) {
    const user = eligibleWithProofs[i];
    const isValid = airdropTree.verifyProof(
      user.address, 
      ELIGIBLE_USERS[i].amount, 
      user.proof
    );
    console.log(`- ${user.address}: ${isValid ? '✅ Valid' : '❌ Invalid'}`);
  }
  
  return {
    merkleRoot: stats.merkleRoot,
    eligibleUsers: eligibleWithProofs,
    stats
  };
}

/**
 * Add new eligible users (for future airdrops)
 */
function addEligibleUsers(newUsers: EligibleUser[]) {
  const updatedUsers = [...ELIGIBLE_USERS, ...newUsers];
  const tree = new AirdropMerkleTree(updatedUsers);
  
  console.log('Updated airdrop with new users:');
  console.log(`- Previous users: ${ELIGIBLE_USERS.length}`);
  console.log(`- New users: ${newUsers.length}`);
  console.log(`- Total users: ${updatedUsers.length}`);
  console.log(`- New merkle root: ${tree.getMerkleRoot()}`);
  
  return tree;
}

/**
 * Verify if an address is eligible
 */
function checkEligibility(address: string): EligibleUser | null {
  return ELIGIBLE_USERS.find(
    user => user.address.toLowerCase() === address.toLowerCase()
  ) || null;
}

/**
 * Generate CSV for non-technical team members
 */
function generateCSV() {
  const tree = new AirdropMerkleTree(ELIGIBLE_USERS);
  const users = tree.getAllEligibleWithProofs();
  
  const csvHeader = 'Address,Amount (Tokens),Amount (Wei),Reason,Proof (first 3)\n';
  const csvRows = users.map(user => {
    const proofPreview = user.proof.slice(0, 3).join(';');
    const reason = ELIGIBLE_USERS.find(u => u.address === user.address)?.reason || '';
    return `${user.address},${user.amount},${user.amountWei},"${reason}","${proofPreview}..."`;
  }).join('\n');
  
  const csvContent = csvHeader + csvRows;
  fs.writeFileSync('./airdrop-data/eligible-users.csv', csvContent);
  console.log('📄 CSV file generated: ./airdrop-data/eligible-users.csv');
}

// Export for use in other files
export {
  AirdropMerkleTree,
  generateAirdropData,
  addEligibleUsers,
  checkEligibility,
  generateCSV,
  ELIGIBLE_USERS
};

// Run if called directly
if (require.main === module) {
  generateAirdropData()
    .then(() => {
      generateCSV();
      console.log('\n🚀 Airdrop data generation complete!');
      console.log('\nNext steps:');
      console.log('1. Review the generated files');
      console.log('2. Deploy the airdrop contract using deploy.ts');
      console.log('3. Update frontend with contract address');
      console.log('4. Test with a few eligible addresses');
      console.log('5. Announce the airdrop! 🎉');
    })
    .catch(console.error);
}