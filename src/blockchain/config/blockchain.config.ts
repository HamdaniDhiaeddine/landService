export const blockchainConfig = {
  provider: {
    local: 'http://127.0.0.1:8545',
    sepolia: process.env.SEPOLIA_RPC_URL 
  },
  contracts: {
    LandRegistry: {
      address: process.env.LAND_REGISTRY_ADDRESS
    },
    LandToken: {
      address: process.env.LAND_TOKEN_ADDRESS 
    },
    LandTokenMarketplace: {
      address: process.env.MARKETPLACE_ADDRESS
    }
  },
  network: process.env.BLOCKCHAIN_NETWORK || 'local'
};