import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Contract, JsonRpcProvider, Wallet, Interface, InterfaceAbi, ethers } from 'ethers';
import { blockchainConfig } from '../config/blockchain.config';
import LandRegistryJSON from '../abis/LandRegistry.json';
import LandTokenJSON from '../abis/LandToken.json';
import LandTokenMarketplaceJSON from '../abis/LandTokenMarketplace.json';
import { ConfigService } from '@nestjs/config';

import axios from 'axios';

// Définir les interfaces pour le typage
interface LandValidation {
  validator: string;
  timestamp: string;
  cidComments: string;
  validatorType: string;
  isValidated: boolean;
}

interface LandDetails {
  id: number;
  location: string;
  surface: number;
  owner: string;
  isRegistered: boolean;
  registrationDate: string;
  status: string;
  totalTokens: number;
  availableTokens: number;
  pricePerToken: string;
  isTokenized: boolean;
  cid: string;
  validations: LandValidation[];
}

interface LandResponse {
  success: boolean;
  data: LandDetails;
  message: string;
}

@Injectable()
export class BlockchainService implements OnModuleInit {
  private provider: JsonRpcProvider;
  private signer: Wallet;
  private landRegistry: Contract;
  private landToken: Contract;
  private marketplace: Contract;

  constructor(private configService: ConfigService) { }

  async onModuleInit() {
    await this.initializeBlockchain();
  }

  getProvider(): JsonRpcProvider {
    return this.provider;
  }

  getLandRegistry(): Contract {
    return this.landRegistry;
  }

  getLandToken(): Contract {
    return this.landToken;
  }

  getMarketplace(): Contract {
    return this.marketplace;
  }

  private async initializeBlockchain() {
    try {
      console.log('Initializing contracts on Sepolia network...');

      const rpcUrl = this.configService.get<string>('SEPOLIA_RPC_URL');
      if (!rpcUrl) {
        throw new Error('SEPOLIA_RPC_URL not configured');
      }

      this.provider = new JsonRpcProvider(rpcUrl);
      await this.provider.ready;
      const network = await this.provider.getNetwork();
      console.log('Connected to network:', network.name);

      const privateKey = this.configService.get<string>('PRIVATE_KEY');
      if (!privateKey) {
        throw new Error('PRIVATE_KEY not configured');
      }

      this.signer = new Wallet(privateKey, this.provider);
      console.log('Signer address:', await this.signer.getAddress());

      const registryAddress = this.configService.get<string>('LAND_REGISTRY_ADDRESS');
      const tokenAddress = this.configService.get<string>('LAND_TOKEN_ADDRESS');
      const marketplaceAddress = this.configService.get<string>('MARKETPLACE_ADDRESS');

      if (!registryAddress || !tokenAddress || !marketplaceAddress) {
        throw new Error('Contract addresses not properly configured');
      }

      this.landRegistry = new Contract(
        registryAddress,
        LandRegistryJSON.abi as InterfaceAbi,
        this.signer
      );

      this.landToken = new Contract(
        tokenAddress,
        LandTokenJSON.abi as InterfaceAbi,
        this.signer
      );

      this.marketplace = new Contract(
        marketplaceAddress,
        LandTokenMarketplaceJSON.abi as InterfaceAbi,
        this.signer
      );

      await this.verifyContracts();
      console.log('Blockchain service initialized successfully on Sepolia');
    } catch (error) {
      console.error('Error initializing blockchain service:', error);
      throw error;
    }
  }

  private async verifyContracts() {
    try {
      const registryOwner = await this.landRegistry.owner();
      console.log('LandRegistry connected at:', this.landRegistry.target);
      console.log('LandRegistry owner:', registryOwner);

      const tokenName = await this.landToken.name();
      console.log('LandToken connected at:', this.landToken.target);
      console.log('Token name:', tokenName);

      const marketplaceLandToken = await this.marketplace.landToken();
      console.log('Marketplace connected at:', this.marketplace.target);
      console.log('Marketplace LandToken:', marketplaceLandToken);
    } catch (error) {
      console.error('Contract verification failed:', error);
      throw new Error('Failed to verify contract connections');
    }
  }

  // Méthodes Land Registry
  async registerLand(landData: {
    title: string;
    location: string;
    surface: number;
    totalTokens: number;
    pricePerToken: string;
    owner: string;
    metadataCID: string;
  }) {
    try {
      if (!landData.owner || !ethers.isAddress(landData.owner)) {
        throw new Error('Invalid owner address');
      }

      const surface = BigInt(landData.surface);
      const totalTokens = BigInt(landData.totalTokens);
      const pricePerToken = ethers.parseEther(landData.pricePerToken);

      const tx = await this.landRegistry.registerLand(
        landData.location,
        surface,
        totalTokens,
        pricePerToken,
        landData.metadataCID,
        {
          from: landData.owner
        }
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(
        log => log.eventName === 'LandRegistered'
      );

      if (!event) {
        throw new Error('Land registration event not found');
      }

      const landId = event.args[0];

      return {
        landId: landId.toString(),
        hash: receipt.hash,
        blockNumber: receipt.blockNumber
      };
    } catch (error) {
      console.error('Error registering land:', error);
      throw new Error(`Erreur lors de l'enregistrement du terrain: ${error.message}`);
    }
  }

  async getAllLands() {
    try {
      console.log('[getAllLands] Starting fetch at:', new Date().toISOString());

      // Liste des providers avec leurs noms
      const providerConfigs = [
        {
          provider: new ethers.JsonRpcProvider('https://1rpc.io/sepolia'),
          name: '1RPC'
        },
        {
          provider: new ethers.JsonRpcProvider('https://rpc.sepolia.org'),
          name: 'Sepolia RPC'
        }
      ];

      let activeProvider = null;
      let contract = null;

      // Essayer chaque provider jusqu'à ce qu'un fonctionne
      for (const { provider, name } of providerConfigs) {
        try {
          await provider.getBlockNumber();
          activeProvider = { provider, name };
          contract = new ethers.Contract(
            this.landRegistry.target,
            this.landRegistry.interface,
            provider
          );
          console.log('Connected successfully to:', name);
          break;
        } catch (error) {
          console.warn(`Provider ${name} failed:`, error.message);
          continue;
        }
      }

      if (!activeProvider || !contract) {
        throw new Error('No working provider found');
      }

      console.log('Contract address:', contract.target);
      console.log('Using provider:', activeProvider.name);

      // Utiliser getLandCounter() pour obtenir le nombre total de terrains
      const totalLands = await contract.getLandCounter();
      console.log('Total lands in contract:', totalLands.toString());

      const lands = [];

      // Parcourir tous les terrains jusqu'au compteur
      for (let i = 1; i <= Number(totalLands); i++) {
        try {
          console.log(`\nFetching land ${i}/${totalLands}`);

          // Utiliser getAllLandDetails qui retourne toutes les informations en une seule fois
          const [
            location,
            surface,
            owner,
            isRegistered,
            registrationDate,
            status,
            totalTokens,
            availableTokens,
            pricePerToken,
            isTokenized,
            cid
          ] = await contract.getAllLandDetails(i);

          console.log(`[Land ${i}] Raw data:`, {
            location,
            surface: surface.toString(),
            owner,
            isRegistered,
            registrationDate: registrationDate.toString(),
            status: status.toString(),
            totalTokens: totalTokens.toString(),
            availableTokens: availableTokens.toString(),
            pricePerToken: pricePerToken.toString(),
            isTokenized,
            cid
          });

          if (isRegistered) {
            const land = {
              id: i,
              location,
              surface: Number(surface),
              owner,
              isRegistered,
              registrationDate: new Date(Number(registrationDate) * 1000).toISOString(),
              status: this.getValidationStatusString(Number(status)),
              totalTokens: Number(totalTokens),
              availableTokens: Number(availableTokens),
              pricePerToken: ethers.formatEther(pricePerToken),
              isTokenized,
              cid,
              validations: []
            };

            try {
              const validations = await contract.getValidationHistory(i);
              if (validations && validations.length > 0) {
                console.log(`[Land ${i}] Found ${validations.length} validations`);
                land.validations = validations.map(v => ({
                  validator: v.validator,
                  timestamp: new Date(Number(v.timestamp) * 1000).toISOString(),
                  cidComments: v.cidComments,
                  validatorType: this.getValidatorTypeString(Number(v.validatorType)),
                  isValidated: v.isValidated
                }));
              }
            } catch (error) {
              console.warn(`[Land ${i}] Failed to get validations:`, error.message);
            }

            lands.push(land);
            console.log(`[Land ${i}] Added to list`);
          } else {
            console.log(`[Land ${i}] Not registered`);
          }

        } catch (error) {
          console.error(`[Land ${i}] Error:`, error.message);
          break;
        }
      }

      const response = {
        success: true,
        data: lands,
        message: lands.length > 0 ? 'Lands retrieved successfully' : 'No registered lands found',
        count: lands.length,
        timestamp: new Date().toISOString(),
        debugInfo: {
          contractAddress: contract.target,
          provider: activeProvider.name,
          currentBlock: await activeProvider.provider.getBlockNumber(),
          totalLandsInContract: totalLands.toString()
        }
      };

      console.log('\nResponse:', JSON.stringify(response, null, 2));
      return response;

    } catch (error) {
      console.error('[getAllLands] Fatal error:', error);
      throw new Error(`Failed to fetch lands: ${error.message}`);
    }
  }

  async getLandDetails(landId: number) {
    try {
      const [
        isTokenized,
        status,
        availableTokens,
        pricePerToken,
        cid
      ] = await this.landRegistry.getLandDetails(landId);

      return {
        success: true,
        data: {
          isTokenized,
          status: this.getValidationStatusString(Number(status)),
          availableTokens: Number(availableTokens),
          pricePerToken: ethers.formatEther(pricePerToken),
          cid
        },
        message: 'Land details retrieved successfully',
        timestamp: new Date().toISOString(),
        requestedBy: 'dalikhouaja008'
      };
    } catch (error) {
      console.error(`Error fetching land details for ID ${landId}:`, error);
      throw new Error(`Failed to retrieve land details: ${error.message}`);
    }
  }

  private getValidationStatusString(status: number): string {
    const statusMap = {
      0: 'EN_ATTENTE',
      1: 'VALIDE',
      2: 'REJETE'
    };
    return statusMap[status] || 'UNKNOWN';
  }

  private getValidatorTypeString(type: number): string {
    const typeMap = {
      0: 'NOTAIRE',
      1: 'GEOMETRE',
      2: 'EXPERT_JURIDIQUE'
    };
    return typeMap[type] || 'UNKNOWN';
  }

  // Méthodes Land Token
  async mintToken(landId: number, value: string) {
    try {
      const tx = await this.landToken.mintToken(landId, {
        value: value
      });
      const receipt = await tx.wait();
      return receipt;
    } catch (error) {
      console.error('Error minting token:', error);
      throw new Error(`Erreur lors du mint du token: ${error.message}`);
    }
  }

  async transferToken(to: string, tokenId: number) {
    try {
      const tx = await this.landToken.transferToken(to, tokenId);
      const receipt = await tx.wait();
      return receipt;
    } catch (error) {
      console.error('Error transferring token:', error);
      throw new Error(`Erreur lors du transfert du token: ${error.message}`);
    }
  }

  // Méthodes Marketplace
  async listToken(tokenId: number, price: string) {
    try {
      const tx = await this.marketplace.listToken(tokenId, price);
      const receipt = await tx.wait();
      return receipt;
    } catch (error) {
      console.error('Error listing token:', error);
      throw new Error(`Erreur lors du listing du token: ${error.message}`);
    }
  }

  async buyToken(tokenId: number) {
    try {
      const listing = await this.marketplace.listings(tokenId);
      const tx = await this.marketplace.buyToken(tokenId, {
        value: listing.price
      });
      const receipt = await tx.wait();
      return receipt;
    } catch (error) {
      console.error('Error buying token:', error);
      throw new Error(`Erreur lors de l'achat du token: ${error.message}`);
    }
  }

  async verifyTransactionDetails(txHash: string) {
    try {
      // Récupérer les détails de la transaction
      const tx = await this.provider.getTransaction(txHash);
      const txReceipt = await this.provider.getTransactionReceipt(txHash);

      if (!tx || !txReceipt) {
        throw new Error('Transaction not found');
      }

      // Vérifions d'abord les détails basiques
      const basicDetails = {
        hash: tx.hash,
        blockNumber: tx.blockNumber,
        timestamp: new Date((await this.provider.getBlock(tx.blockNumber))?.timestamp * 1000).toISOString(),
        from: tx.from,
        to: tx.to,
        value: ethers.formatEther(tx.value),
        gasUsed: txReceipt.gasUsed.toString(),
        effectiveGasPrice: ethers.formatUnits(txReceipt.gasPrice || 0, 'gwei'),
        status: txReceipt.status === 1 ? 'Success' : 'Failed'
      };

      // Vérifier si c'est notre contrat
      const isOurContract = tx.to?.toLowerCase() === this.landRegistry.target.toString().toLowerCase();

      // Si c'est notre contrat, décodons l'input
      let decodedInput = null;
      if (isOurContract) {
        try {
          decodedInput = this.landRegistry.interface.parseTransaction({ data: tx.data, value: tx.value });
          console.log('Decoded input:', decodedInput);
        } catch (error) {
          console.warn('Could not decode transaction input:', error);
        }
      }

      // Chercher l'événement LandRegistered dans les logs
      let landRegisteredEvent = null;
      for (const log of txReceipt.logs) {
        try {
          // Créer une nouvelle interface avec juste l'événement qui nous intéresse
          const eventInterface = new Interface([
            "event LandRegistered(uint256 indexed landId, string location, address owner, uint256 totalTokens, uint256 pricePerToken, string cid)"
          ]);

          // Essayer de parser le log
          const parsed = eventInterface.parseLog({
            topics: log.topics,
            data: log.data
          });

          if (parsed) {
            landRegisteredEvent = {
              landId: parsed.args[0].toString(),
              location: parsed.args[1],
              owner: parsed.args[2],
              totalTokens: parsed.args[3].toString(),
              pricePerToken: ethers.formatEther(parsed.args[4]),
              cid: parsed.args[5]
            };
            console.log('Found LandRegistered event:', landRegisteredEvent);
            break;
          }
        } catch (error) {
          // Ignorer les erreurs de parsing pour les logs qui ne correspondent pas
          continue;
        }
      }

      // Si nous avons trouvé un landId, récupérons les détails du terrain
      let landDetails = null;
      if (landRegisteredEvent?.landId) {
        try {
          const land = await this.landRegistry.lands(landRegisteredEvent.landId);
          landDetails = {
            id: landRegisteredEvent.landId,
            location: land.location,
            surface: Number(land.surface),
            owner: land.owner,
            isRegistered: land.isRegistered,
            registrationDate: Number(land.registrationDate) === 0
              ? null
              : new Date(Number(land.registrationDate) * 1000).toISOString(),
            status: this.getValidationStatusString(Number(land.status)),
            totalTokens: Number(land.totalTokens),
            availableTokens: Number(land.availableTokens),
            pricePerToken: ethers.formatEther(land.pricePerToken),
            isTokenized: land.isTokenized,
            cid: land.cid
          };
        } catch (error) {
          console.warn('Could not fetch land details:', error);
        }
      }

      // Construire la réponse
      return {
        success: true,
        message: 'Transaction details retrieved successfully',
        data: {
          transaction: basicDetails,
          contractInteraction: {
            isOurContract,
            decodedInput: decodedInput ? {
              name: decodedInput.name,
              args: decodedInput.args
            } : null,
            landRegisteredEvent
          },
          landDetails,
          links: {
            etherscan: `https://sepolia.etherscan.io/tx/${txHash}`,
            block: `https://sepolia.etherscan.io/block/${tx.blockNumber}`
          }
        }
      };

    } catch (error) {
      console.error('Error verifying transaction:', error);
      return {
        success: false,
        message: `Error verifying transaction: ${error.message}`,
        data: null
      };
    }
  }

  // Ajoutez une méthode pour vérifier spécifiquement le terrain
  async verifyLand(landId: number) {
    try {
      console.log(`Verifying land ${landId}...`);
      const land = await this.landRegistry.lands(landId);
      console.log('Land data:', land);

      if (!land || !land.isRegistered) {
        return {
          success: false,
          message: `Land ${landId} not found or not registered`,
          data: null
        };
      }

      return {
        success: true,
        message: 'Land verified successfully',
        data: {
          id: landId,
          location: land.location,
          surface: Number(land.surface),
          owner: land.owner,
          isRegistered: land.isRegistered,
          registrationDate: Number(land.registrationDate) === 0
            ? null
            : new Date(Number(land.registrationDate) * 1000).toISOString(),
          status: this.getValidationStatusString(Number(land.status)),
          totalTokens: Number(land.totalTokens),
          availableTokens: Number(land.availableTokens),
          pricePerToken: ethers.formatEther(land.pricePerToken),
          isTokenized: land.isTokenized,
          cid: land.cid
        }
      };
    } catch (error) {
      console.error('Error verifying land:', error);
      return {
        success: false,
        message: `Error verifying land: ${error.message}`,
        data: null
      };
    }
  }
}