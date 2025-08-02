"use client"

import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { createWeb3Modal, defaultConfig } from '@web3modal/ethers/react';
import { useWeb3ModalProvider, useWeb3ModalAccount } from '@web3modal/ethers/react';

// Types
interface ClaimData {
  address: string;
  amount: string;
  proof: string[];
}

interface AirdropStats {
  totalClaimable: string;
  totalClaimed: string;
  remainingTokens: string;
  claimPeriodEnd: number;
  isActive: boolean;
}

interface ClaimStatus {
  claimed: boolean;
  amount: string;
  canStillClaim: boolean;
}

// Contract ABI (simplified for demo)
const AIRDROP_ABI = [
  "function claimTokens(uint256 amount, bytes32[] calldata merkleProof) external",
  "function canClaim(address user, uint256 amount, bytes32[] calldata merkleProof) external view returns (bool)",
  "function getClaimStatus(address user) external view returns (bool claimed, uint256 amount, bool canStillClaim)",
  "function getAirdropStats() external view returns (uint256, uint256, uint256, uint256, bool)",
  "function hasClaimed(address user) external view returns (bool)",
  "event TokensClaimed(address indexed claimer, uint256 amount, uint256 timestamp)"
];

// Contract addresses (update with your deployed addresses)
const CONTRACT_ADDRESSES = {
  8453: "0x...", // Base
  137: "0x...",  // Polygon
  1: "0x..."     // Ethereum
};

// Web3Modal setup
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo';

const metadata = {
  name: 'PayCrypt Airdrop',
  description: 'Claim your PayCrypt tokens',
  url: 'https://paycrypt.com',
  icons: ['/paycrypt-logo.png']
};

const ethersConfig = defaultConfig({
  metadata,
  enableEIP6963: true,
  enableInjected: true,
  enableCoinbase: true,
  defaultChainId: 8453
});

createWeb3Modal({
  ethersConfig,
  chains: [
    {
      chainId: 8453,
      name: 'Base',
      currency: 'ETH',
      explorerUrl: 'https://basescan.org',
      rpcUrl: 'https://base-rpc.publicnode.com'
    }
  ],
  projectId,
  enableAnalytics: true
});

// Mock eligibility data (in real app, fetch from your backend)
const ELIGIBLE_ADDRESSES: Record<string, ClaimData> = {
  "0x742d35Cc6661C0532108D3CE8c8FCfb4F88CA7C5": {
    address: "0x742d35Cc6661C0532108D3CE8c8FCfb4F88CA7C5",
    amount: "1000000000000000000000", // 1000 tokens
    proof: [
      "0x8da9e1c820f9dbd1589fd6585872bc1063588625729e7ab0797cfc63a00bd950",
      "0x995788ffc103b987ad50f5e5707fd094419eb12d9552cc423bd0cd86a3861433"
    ]
  }
  // Add more eligible addresses here
};

export default function AirdropClaimPage() {
  const { address, chainId, isConnected } = useWeb3ModalAccount();
  const { walletProvider } = useWeb3ModalProvider();
  
  // State
  const [claimData, setClaimData] = useState<ClaimData | null>(null);
  const [claimStatus, setClaimStatus] = useState<ClaimStatus | null>(null);
  const [airdropStats, setAirdropStats] = useState<AirdropStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string>('');
  const [error, setError] = useState<string>('');

  // Get contract instance
  const getContract = async () => {
    if (!walletProvider || !chainId) return null;
    
    const contractAddress = CONTRACT_ADDRESSES[chainId as keyof typeof CONTRACT_ADDRESSES];
    if (!contractAddress) {
      throw new Error(`Contract not deployed on chain ${chainId}`);
    }
    
    const provider = new ethers.BrowserProvider(walletProvider);
    const signer = await provider.getSigner();
    return new ethers.Contract(contractAddress, AIRDROP_ABI, signer);
  };

  // Check eligibility
  const checkEligibility = async () => {
    if (!address) return;
    
    // Check if user is in eligible list
    const eligible = ELIGIBLE_ADDRESSES[address.toLowerCase()];
    setClaimData(eligible || null);
    
    // Get onchain claim status
    try {
      const contract = await getContract();
      if (!contract) return;
      
      const [claimed, amount, canStillClaim] = await contract.getClaimStatus(address);
      setClaimStatus({
        claimed,
        amount: ethers.formatEther(amount),
        canStillClaim
      });
    } catch (err) {
      console.error('Error checking claim status:', err);
    }
  };

  // Load airdrop statistics
  const loadStats = async () => {
    try {
      const contract = await getContract();
      if (!contract) return;
      
      const [totalClaimable, totalClaimed, remainingTokens, claimPeriodEnd, isActive] = 
        await contract.getAirdropStats();
      
      setAirdropStats({
        totalClaimable: ethers.formatEther(totalClaimable),
        totalClaimed: ethers.formatEther(totalClaimed),
        remainingTokens: ethers.formatEther(remainingTokens),
        claimPeriodEnd: Number(claimPeriodEnd),
        isActive
      });
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  // Claim tokens
  const claimTokens = async () => {
    if (!claimData || !walletProvider) return;
    
    setLoading(true);
    setError('');
    
    try {
      const contract = await getContract();
      if (!contract) throw new Error('Contract not available');
      
      // Convert amount to wei
      const amountWei = ethers.parseEther(
        ethers.formatEther(claimData.amount)
      );
      
      // Execute claim transaction
      const tx = await contract.claimTokens(amountWei, claimData.proof);
      setTxHash(tx.hash);
      
      // Wait for confirmation
      await tx.wait();
      
      // Refresh data
      await checkEligibility();
      await loadStats();
      
      setLoading(false);
    } catch (err: any) {
      console.error('Claim error:', err);
      setError(err.message || 'Failed to claim tokens');
      setLoading(false);
    }
  };

  // Effects
  useEffect(() => {
    if (isConnected && address) {
      checkEligibility();
      loadStats();
    }
  }, [isConnected, address, chainId]);

  // Helper functions
  const formatTimeRemaining = (endTime: number) => {
    const now = Math.floor(Date.now() / 1000);
    const remaining = endTime - now;
    
    if (remaining <= 0) return 'Ended';
    
    const days = Math.floor(remaining / 86400);
    const hours = Math.floor((remaining % 86400) / 3600);
    
    return `${days}d ${hours}h remaining`;
  };

  const getClaimButtonText = () => {
    if (loading) return 'Claiming...';
    if (claimStatus?.claimed) return 'Already Claimed';
    if (!claimData) return 'Not Eligible';
    if (!airdropStats?.isActive) return 'Claim Period Ended';
    return `Claim ${ethers.formatEther(claimData.amount)} PCRYPT`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            PayCrypt Airdrop
          </h1>
          <p className="text-xl text-gray-600">
            Claim your PCRYPT tokens for early supporters
          </p>
        </div>

        {/* Connection Status */}
        {!isConnected ? (
          <div className="bg-white rounded-xl shadow-lg p-8 text-center mb-8">
            <h2 className="text-2xl font-semibold mb-4">Connect Your Wallet</h2>
            <p className="text-gray-600 mb-6">
              Connect your wallet to check eligibility and claim tokens
            </p>
            <w3m-button />
          </div>
        ) : (
          <>
            {/* Airdrop Stats */}
            {airdropStats && (
              <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
                <h2 className="text-xl font-semibold mb-4">Airdrop Statistics</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {parseFloat(airdropStats.totalClaimable).toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-600">Total Available</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {parseFloat(airdropStats.totalClaimed).toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-600">Claimed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">
                      {parseFloat(airdropStats.remainingTokens).toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-600">Remaining</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold text-purple-600">
                      {formatTimeRemaining(airdropStats.claimPeriodEnd)}
                    </div>
                    <div className="text-sm text-gray-600">Time Left</div>
                  </div>
                </div>
              </div>
            )}

            {/* Claim Section */}
            <div className="bg-white rounded-xl shadow-lg p-8">
              <h2 className="text-2xl font-semibold mb-6">Claim Your Tokens</h2>
              
              {/* Wallet Info */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <p className="text-sm text-gray-600">Connected Wallet:</p>
                <p className="font-mono text-sm">{address}</p>
                <p className="text-sm text-gray-600 mt-1">
                  Chain: {chainId === 8453 ? 'Base' : `Chain ${chainId}`}
                </p>
              </div>

              {/* Eligibility Status */}
              {claimData ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
                    <span className="text-green-800 font-semibold">
                      You are eligible to claim {ethers.formatEther(claimData.amount)} PCRYPT tokens!
                    </span>
                  </div>
                </div>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-red-500 rounded-full mr-3"></div>
                    <span className="text-red-800">
                      This wallet is not eligible for the airdrop
                    </span>
                  </div>
                </div>
              )}

              {/* Claim Status */}
              {claimStatus && claimStatus.claimed && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-blue-500 rounded-full mr-3"></div>
                    <span className="text-blue-800">
                      You have already claimed {claimStatus.amount} PCRYPT tokens
                    </span>
                  </div>
                </div>
              )}

              {/* Error Display */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                  <p className="text-red-800">{error}</p>
                </div>
              )}

              {/* Transaction Hash */}
              {txHash && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                  <p className="text-green-800">
                    Transaction submitted: 
                    <a 
                      href={`https://basescan.org/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 underline hover:text-green-600"
                    >
                      View on BaseScan
                    </a>
                  </p>
                </div>
              )}

              {/* Claim Button */}
              <button
                onClick={claimTokens}
                disabled={
                  loading || 
                  !claimData || 
                  claimStatus?.claimed || 
                  !airdropStats?.isActive
                }
                className={`w-full py-4 px-6 rounded-lg font-semibold text-white transition-colors ${
                  loading || 
                  !claimData || 
                  claimStatus?.claimed || 
                  !airdropStats?.isActive
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {getClaimButtonText()}
              </button>

              {/* Instructions */}
              <div className="mt-6 text-sm text-gray-600">
                <h3 className="font-semibold mb-2">How to claim:</h3>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Make sure you're connected to the Base network</li>
                  <li>Check that your wallet is eligible</li>
                  <li>Click the claim button and confirm the transaction</li>
                  <li>Wait for transaction confirmation</li>
                  <li>Tokens will appear in your wallet</li>
                </ol>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}