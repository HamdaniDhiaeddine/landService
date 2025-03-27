export const blockchainConfig = {
    provider: {
      local: 'http://127.0.0.1:8545',
      // Plus tard pour Sepolia
      // sepolia: 'https://eth-sepolia.g.alchemy.com/v2/YOUR-API-KEY'
    },
    contracts: {
      LandRegistry: {
        address: '0x5FbDB2315678afecb367f032d93F642f64180aa3'
      },
      LandToken: {
        address: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'
      },
      LandTokenMarketplace: {
        address: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9'
      }
    }
  };