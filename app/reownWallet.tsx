"use client"

import React, { useEffect, useState } from 'react';

// Lazily import the Reown AppKit SDK at runtime so the project doesn't fail
// to build if the dependency isn't installed. This component gives a helpful
// fallback button instructing how to install the SDK.

type ReownSdk = {
  createAppKit: (opts?: any) => Promise<any> | any;
};

export function useReown() {
  const [sdk, setSdk] = useState<ReownSdk | null>(null);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const mod = await import('@reown/appkit');
        if (!mounted) return;
        setSdk(mod as unknown as ReownSdk);
        setAvailable(true);
      } catch (err) {
        // SDK not installed — keep available = false. App will show fallback.
        setSdk(null);
        setAvailable(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  return { sdk, available } as const;
}

export function ReownConnectButton(): JSX.Element {
  const { sdk, available } = useReown();
  const [connected, setConnected] = useState(false);

  const handleConnect = async () => {
    if (!sdk) return;
    try {
      // The real AppKit API may differ; this is an illustrative example.
      const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || 'demo';
      // createAppKit might be default-exported or named; use (sdk as any) to be permissive.
      const appkit = (sdk as any).createAppKit ? (sdk as any).createAppKit({ projectId }) : (sdk as any).default?.createAppKit({ projectId });
      // Some SDKs return an instance sync, others async — handle both.
      const instance = appkit instanceof Promise ? await appkit : appkit;
      if (!instance) throw new Error('Failed to initialize Reown AppKit');
      if (typeof instance.connect === 'function') {
        await instance.connect();
      }
      setConnected(true);
    } catch (err) {
      console.error('Reown connect error', err);
      window.alert('Failed to connect via Reown AppKit. Check console for details.');
    }
  };

  if (!available) {
    return (
      <div className="text-center">
        <button
          onClick={() => window.alert('Reown AppKit SDK not installed. Run `npm i @reown/appkit` and set NEXT_PUBLIC_REOWN_PROJECT_ID in your environment.')}
          className="inline-block bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-2 px-4 rounded"
        >
          Install Reown to Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="text-center">
      <button
        onClick={handleConnect}
        className={`inline-block ${connected ? 'bg-green-600' : 'bg-blue-600'} text-white font-semibold py-2 px-4 rounded`}
      >
        {connected ? 'Connected' : 'Connect Wallet'}
      </button>
    </div>
  );
}

export default ReownConnectButton;
