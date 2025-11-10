# PayCrypt Airdrop

A token airdrop claiming interface for PayCrypt token holders.

## Wallet Connection

This dapp supports two wallet connection methods:

### Reown AppKit (Recommended)

To enable the Reown AppKit wallet connector:

1. Install the SDK:
   ```bash
   npm install @reown/appkit
   ```

2. Add your Reown project ID to `.env.local`:
   ```
   NEXT_PUBLIC_REOWN_PROJECT_ID=your_project_id_here
   ```

   If you don't have a project ID, the connect button will show instructions.

### Web3Modal (Alternative)

The app also supports Web3Modal as a fallback wallet connector. No additional setup required.

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Visit `http://localhost:3000` to see the app.
