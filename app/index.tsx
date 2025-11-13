"use client"

import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { createWeb3Modal, defaultConfig } from '@web3modal/ethers/react';
import { useWeb3ModalProvider, useWeb3ModalAccount } from '@web3modal/ethers/react';
import dynamic from 'next/dynamic';
import ReownConnectButton from './reownWallet';
import './animations.css';

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
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 py-12 px-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse-delay-1"></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse-delay-2"></div>
      </div>

      <div className="max-w-5xl mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-12 animate-fade-in">
          <div className="inline-block mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-purple-500 rounded-full blur-xl opacity-50"></div>
              <div className="relative bg-gradient-to-r from-blue-500 to-purple-600 text-transparent bg-clip-text">
                <h1 className="text-6xl font-extrabold mb-2 tracking-tight">
                  PayCrypt Airdrop
                </h1>
              </div>
            </div>
          </div>
          <p className="text-xl text-gray-200 max-w-2xl mx-auto leading-relaxed">
            Join the future of decentralized payments. Claim your PCRYPT tokens and become part of our early supporter community.
          </p>
        </div>

        {/* Connection Status */}
        {!isConnected ? (
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl shadow-2xl p-12 text-center mb-8 transform transition-all duration-300 hover:scale-105">
            <div className="mb-6">
              <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-3xl font-bold mb-3 text-white">Connect Your Wallet</h2>
              <p className="text-gray-200 text-lg">
                Securely connect your wallet to check eligibility and claim your tokens
              </p>
            </div>
            {/* Reown AppKit connect button (falls back to instructing install) */}
            <div className="space-y-4">
              <ReownConnectButton />
              {/* Keep <w3m-button /> available as an alternative if Reown isn't used */}
              <div className="pt-2">
                <w3m-button />
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Airdrop Stats */}
            {airdropStats && (
              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl shadow-2xl p-8 mb-8 transform transition-all duration-300">
                <h2 className="text-2xl font-bold mb-6 text-white flex items-center">
                  <svg className="w-6 h-6 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                  </svg>
                  Airdrop Statistics
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="text-center p-4 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-400/30 transform transition-all duration-300 hover:scale-105">
                    <div className="text-3xl font-bold text-blue-300 mb-1">
                      {parseFloat(airdropStats.totalClaimable).toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-300 font-medium">Total Available</div>
                  </div>
                  <div className="text-center p-4 rounded-xl bg-gradient-to-br from-green-500/20 to-green-600/20 border border-green-400/30 transform transition-all duration-300 hover:scale-105">
                    <div className="text-3xl font-bold text-green-300 mb-1">
                      {parseFloat(airdropStats.totalClaimed).toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-300 font-medium">Claimed</div>
                  </div>
                  <div className="text-center p-4 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-600/20 border border-orange-400/30 transform transition-all duration-300 hover:scale-105">
                    <div className="text-3xl font-bold text-orange-300 mb-1">
                      {parseFloat(airdropStats.remainingTokens).toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-300 font-medium">Remaining</div>
                  </div>
                  <div className="text-center p-4 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/20 border border-purple-400/30 transform transition-all duration-300 hover:scale-105">
                    <div className="text-lg font-bold text-purple-300 mb-1">
                      {formatTimeRemaining(airdropStats.claimPeriodEnd)}
                    </div>
                    <div className="text-sm text-gray-300 font-medium">Time Left</div>
                  </div>
                </div>
              </div>
            )}

            {/* Claim Section */}
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl shadow-2xl p-8 transform transition-all duration-300">
              <h2 className="text-3xl font-bold mb-8 text-white flex items-center">
                <svg className="w-8 h-8 mr-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
                Claim Your Tokens
              </h2>
              
              {/* Wallet Info */}
              <div className="bg-gradient-to-r from-indigo-500/20 to-purple-500/20 backdrop-blur-sm rounded-xl p-5 mb-6 border border-indigo-400/30">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-300 mb-1 font-medium">Connected Wallet</p>
                    <p className="font-mono text-sm text-white truncate">{address}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-300 border border-green-400/30">
                      <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
                      {chainId === 8453 ? 'Base Network' : `Chain ${chainId}`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Eligibility Status */}
              {claimData ? (
                <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-400/40 rounded-xl p-5 mb-6 transform transition-all duration-300 hover:scale-[1.02]">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className="w-6 h-6 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-lg font-bold text-green-300 mb-1">Congratulations! You're Eligible</h3>
                      <p className="text-green-200">
                        You can claim <span className="font-bold text-xl text-green-100">{ethers.formatEther(claimData.amount)} PCRYPT</span> tokens
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-gradient-to-r from-red-500/20 to-pink-500/20 border border-red-400/40 rounded-xl p-5 mb-6">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className="w-6 h-6 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-lg font-bold text-red-300 mb-1">Not Eligible</h3>
                      <p className="text-red-200">
                        This wallet is not eligible for the airdrop. Try checking another wallet.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Claim Status */}
              {claimStatus && claimStatus.claimed && (
                <div className="bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border border-blue-400/40 rounded-xl p-5 mb-6">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className="w-6 h-6 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-lg font-bold text-blue-300 mb-1">Already Claimed</h3>
                      <p className="text-blue-200">
                        You have successfully claimed <span className="font-bold text-blue-100">{claimStatus.amount} PCRYPT</span> tokens
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Error Display */}
              {error && (
                <div className="bg-gradient-to-r from-red-500/20 to-orange-500/20 border border-red-400/40 rounded-xl p-5 mb-6 animate-shake">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className="w-6 h-6 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-lg font-bold text-red-300 mb-1">Transaction Failed</h3>
                      <p className="text-red-200 text-sm">{error}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Transaction Hash */}
              {txHash && (
                <div className="bg-gradient-to-r from-green-500/20 to-teal-500/20 border border-green-400/40 rounded-xl p-5 mb-6 animate-slide-up">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className="w-6 h-6 text-green-400 animate-bounce" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3 flex-1">
                      <h3 className="text-lg font-bold text-green-300 mb-1">Transaction Submitted!</h3>
                      <p className="text-green-200 text-sm mb-2">Your claim is being processed on the blockchain</p>
                      <a 
                        href={`https://basescan.org/tx/${txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-sm font-medium text-green-300 hover:text-green-100 transition-colors"
                      >
                        View on BaseScan
                        <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                  </div>
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
                className={`w-full py-5 px-8 rounded-xl font-bold text-lg text-white transition-all duration-300 transform ${
                  loading || 
                  !claimData || 
                  claimStatus?.claimed || 
                  !airdropStats?.isActive
                    ? 'bg-gray-600/50 cursor-not-allowed backdrop-blur-sm'
                    : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 hover:scale-[1.02] hover:shadow-2xl hover:shadow-purple-500/50 active:scale-95'
                }`}
              >
                {loading && (
                  <svg className="inline w-5 h-5 mr-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                {getClaimButtonText()}
              </button>

              {/* Instructions */}
              <div className="mt-8 p-6 rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-400/20">
                <h3 className="font-bold text-lg mb-4 text-white flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  How to Claim
                </h3>
                <ol className="space-y-3 text-gray-200">
                  <li className="flex items-start">
                    <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-blue-500/30 text-blue-300 text-sm font-bold mr-3 mt-0.5">1</span>
                    <span>Make sure you're connected to the Base network</span>
                  </li>
                  <li className="flex items-start">
                    <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-blue-500/30 text-blue-300 text-sm font-bold mr-3 mt-0.5">2</span>
                    <span>Verify your wallet is eligible for the airdrop</span>
                  </li>
                  <li className="flex items-start">
                    <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-blue-500/30 text-blue-300 text-sm font-bold mr-3 mt-0.5">3</span>
                    <span>Click the claim button and confirm the transaction in your wallet</span>
                  </li>
                  <li className="flex items-start">
                    <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-blue-500/30 text-blue-300 text-sm font-bold mr-3 mt-0.5">4</span>
                    <span>Wait for blockchain confirmation (usually takes a few seconds)</span>
                  </li>
                  <li className="flex items-start">
                    <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-blue-500/30 text-blue-300 text-sm font-bold mr-3 mt-0.5">5</span>
                    <span>PCRYPT tokens will appear in your wallet automatically</span>
                  </li>
                </ol>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
