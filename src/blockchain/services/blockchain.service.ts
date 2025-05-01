import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Contract, JsonRpcProvider, Wallet, Interface, InterfaceAbi, ethers } from 'ethers';
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
  private readonly logger = new Logger(BlockchainService.name);
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
  // Dans BlockchainService
  async mintToken(landId: number, value: string): Promise<any> {
    try {
      this.logger.log(`Starting mint token process for land ID: ${landId} with value: ${value}`);

      // 1. Vérifier si le terrain existe et est tokenisé
      const [
        isTokenized,
        status,
        availableTokens,
        pricePerToken,
        cid
      ] = await this.landRegistry.getLandDetails(landId);

      if (!isTokenized) {
        throw new Error(`Land ID ${landId} is not tokenized yet. Please tokenize the land first.`);
      }

      if (status.toString() !== "1") {
        throw new Error(`Land ID ${landId} is not validated. Current status: ${this.getValidationStatusString(Number(status))}`);
      }

      if (Number(availableTokens) <= 0) {
        throw new Error(`No tokens available for land ID ${landId}`);
      }

      // 2. Convertir la valeur en wei si ce n'est pas déjà fait
      let valueInWei = value;
      if (!value.includes('e+') && !value.startsWith('0x')) {
        // Si c'est un nombre en ETH, convertir en wei
        valueInWei = ethers.parseEther(value).toString();
        this.logger.log(`Converted value from ${value} ETH to ${valueInWei} wei`);
      }

      // 3. Vérifier que la valeur est suffisante
      const priceInWei = pricePerToken; // Déjà en wei depuis le smart contract
      if (BigInt(valueInWei) < BigInt(priceInWei)) {
        throw new Error(`Insufficient payment. Required: ${ethers.formatEther(priceInWei)} ETH, Provided: ${ethers.formatEther(valueInWei)} ETH`);
      }

      // 4. Appeler le smart contract
      this.logger.log(`Calling mintToken with landId: ${landId}, value: ${valueInWei} wei`);
      const tx = await this.landToken.mintToken(landId, {
        value: valueInWei
      });

      // 5. Attendre la confirmation
      this.logger.log(`Transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();

      // 6. Journaliser le succès
      this.logger.log(`Token minted successfully for land ID ${landId}`, {
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      });

      // 7. Rechercher l'événement TokenMinted
      let tokenId = null;
      const event = receipt.logs.find(
        log => log.eventName === 'TokenMinted'
      );

      if (event) {
        tokenId = event.args[1]; // Index 1 devrait être tokenId
      }

      return {
        hash: receipt.hash,
        blockNumber: receipt.blockNumber,
        tokenId: tokenId ? tokenId.toString() : null,
        landId
      };
    } catch (error) {
      this.logger.error(`Error minting token for land ID ${landId}:`, error);

      // Améliorer le message d'erreur selon le type d'erreur
      let errorMessage = `Erreur lors du mint du token: ${error.message}`;

      if (error.message.includes('insufficient funds')) {
        errorMessage = 'Fonds insuffisants pour couvrir le prix du token et les frais de gaz';
      } else if (error.message.includes('LandNotTokenized')) {
        errorMessage = 'Le terrain n\'est pas encore tokenisé';
      } else if (error.message.includes('LandNotValidated')) {
        errorMessage = 'Le terrain n\'est pas encore validé';
      } else if (error.message.includes('NoTokensAvailable')) {
        errorMessage = 'Aucun token disponible pour ce terrain';
      } else if (error.message.includes('InsufficientPayment')) {
        errorMessage = 'Paiement insuffisant pour acheter le token';
      }

      throw new Error(errorMessage);
    }
  }
  /**
 * Mint un token pour un utilisateur spécifié
 * @param landId ID du terrain
 * @param recipient Adresse Ethereum qui recevra le token
 * @param value Montant en ETH à payer pour le token
 * @returns Détails de la transaction
 */
  async mintTokenForUser(landId: number, recipient: string, value: string) {
    try {
      this.logger.log(`Minting token for land ID ${landId} to recipient ${recipient} with value ${value}`);

      // Vérifier que l'adresse du destinataire est valide
      if (!ethers.isAddress(recipient)) {
        throw new Error(`Invalid recipient address: ${recipient}`);
      }

      // CORRECTION: Convertir la valeur ETH en wei (BigInt compatible)
      const valueInWei = ethers.parseEther(value);

      // Appeler la fonction mintTokenForUser du contrat
      const tx = await this.landToken.mintTokenForUser(landId, recipient, {
        value: valueInWei,  // Utiliser la valeur convertie en wei
        gasLimit: BigInt(300000)
      });

      const receipt = await tx.wait();

      this.logger.log(`Token minted successfully for land ID ${landId} to ${recipient}`);
      this.logger.log(`Transaction hash: ${receipt.hash}`);

      // Extraire l'ID du token depuis l'événement
      const tokenId = this.extractTokenIdFromReceipt(receipt);

      return {
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        tokenId: tokenId,
        recipient: recipient,
        landId: landId
      };
    } catch (error) {
      this.logger.error(`Error minting token for user: ${error.message}`);
      throw new Error(`Failed to mint token: ${error.message}`);
    }
  }

  // Ajouter cette méthode pour extraire l'ID du token
  private extractTokenIdFromReceipt(receipt) {
    for (const log of receipt.logs) {
      if (log.eventName === 'TokenMinted') {
        return log.args[1]; // L'ID du token est le deuxième argument de l'événement
      }
    }

    this.logger.warn('TokenMinted event not found in logs');
    return null;
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


  async validateLandWithRelayer(
    params: {
      landId: string;
      validatorAddress: string;
      cidComments: string;
      isValid: boolean;
    }
  ): Promise<{
    receipt: any;
    validationDetails: {
      landId: string;
      validator: string;
      isValid: boolean;
      txHash: string;
      blockNumber: number;
      timestamp: string;
    };
  }> {
    const { landId, validatorAddress, cidComments, isValid } = params;

    try {
      const blockchainId = Number(landId);
      if (isNaN(blockchainId) || blockchainId <= 0) {
        throw new Error(`Invalid blockchain land ID: ${landId}`);
      }

      // Vérifier que le contrat est bien initialisé
      if (!this.landRegistry || !this.landRegistry.runner?.provider) {
        throw new Error('Contract not properly initialized');
      }

      this.logger.log('Starting validation process', {
        landId: blockchainId,
        validator: validatorAddress,
        isValid,
        timestamp: '2025-04-06 01:46:45',
        userLogin: 'dalikhouaja008'
      });

      /* Temporairement commenté en attendant l'ajout des validators
      // Vérification des rôles
      const [isRelayer, isValidator] = await Promise.all([
          this.landRegistry.relayers(this.signer.address),
          this.landRegistry.validators(this.signer.address)
      ]);

      this.logger.log('Role verification', {
          address: this.signer.address,
          isRelayer,
          isValidator,
          timestamp: '2025-04-06 01:46:45',
          userLogin: 'dalikhouaja008'
      });

      if (!isRelayer && !isValidator) {
          throw new Error('Address is neither a relayer nor a validator');
      }

      // Vérification du validateur
      const validatorIsAuthorized = await this.landRegistry.validators(validatorAddress);
      
      this.logger.log('Validator authorization check', {
          validator: validatorAddress,
          isAuthorized: validatorIsAuthorized,
          timestamp: '2025-04-06 01:46:45',
          userLogin: 'dalikhouaja008'
      });

      if (!validatorIsAuthorized) {
          throw new Error('Validator is not authorized');
      }
      */

      // Vérifications des paramètres
      if (!cidComments || cidComments.trim() === '') {
        throw new Error('CID comments cannot be empty');
      }

      if (!ethers.isAddress(validatorAddress)) {
        throw new Error('Invalid validator address');
      }

      // Vérification que le terrain existe
      const landDetails = await this.landRegistry.getAllLandDetails(blockchainId);

      this.logger.log('Land details retrieved', {
        landId: blockchainId,
        isRegistered: landDetails[3],
        owner: landDetails[2],
        timestamp: '2025-04-06 01:46:45',
        userLogin: 'dalikhouaja008'
      });

      if (!landDetails[3]) {
        throw new Error(`Land ID ${blockchainId} exists but is not registered`);
      }

      // Envoi de la transaction
      const tx = await this.landRegistry.validateLand(
        blockchainId,
        cidComments,
        isValid,
        validatorAddress,
        {
          gasLimit: BigInt(500000)
        }
      );

      this.logger.log('Transaction sent', {
        hash: tx.hash,
        from: this.signer.address,
        to: this.landRegistry.target,
        gasLimit: '500000',
        timestamp: '2025-04-06 01:46:45',
        userLogin: 'dalikhouaja008'
      });

      // Attente de la confirmation
      const receipt = await tx.wait();

      if (receipt.status === 0) {
        throw new Error('Transaction failed on-chain');
      }

      this.logger.log('Transaction confirmed', {
        hash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        status: receipt.status,
      });

      return {
        receipt,
        validationDetails: {
          landId: blockchainId.toString(),
          validator: validatorAddress,
          isValid,
          txHash: receipt.hash,
          blockNumber: receipt.blockNumber,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      this.logger.error('Validation failed', {
        error: error.message,
        landId,
        validator: validatorAddress,
        timestamp: '2025-04-06 01:46:45',
        userLogin: 'dalikhouaja008'
      });

      if (error.message.includes('UnauthorizedValidator')) {
        throw new Error(`Validator ${validatorAddress} is not authorized`);
      }
      if (error.message.includes('ValidatorAlreadyValidated')) {
        throw new Error(`Validator ${validatorAddress} has already validated this land`);
      }
      if (error.message.includes('revert')) {
        const reason = error.reason || 'Unknown reason';
        throw new Error(`Smart contract reverted: ${reason}`);
      }

      throw new Error(`Validation failed: ${error.message}`);
    }
  }
  /**
   * Tokenise un terrain validé.
   * @param landId ID du terrain à tokeniser
   * @returns Résultat de la transaction
   */
  async tokenizeLand(landId: number) {
    try {
      console.log(`Starting tokenization process for land ID: ${landId}`);

      // Vérifier si le terrain est validé et pas encore tokenisé
      const [
        isTokenized,
        status,
        availableTokens,
        pricePerToken,
        cid
      ] = await this.landRegistry.getLandDetails(landId);

      if (isTokenized) {
        throw new Error(`Land ID ${landId} is already tokenized`);
      }

      if (status.toString() !== "1") {
        throw new Error(`Land ID ${landId} is not validated yet. Current status: ${this.getValidationStatusString(Number(status))}`);
      }

      // Tokeniser le terrain via LandToken.tokenizeLand
      const tx = await this.landToken.tokenizeLand(landId);
      const receipt = await tx.wait();

      // Vérifier que le terrain a bien été tokenisé
      const [isTokenizedAfter] = await this.landRegistry.getLandDetails(landId);

      if (!isTokenizedAfter) {
        throw new Error(`Land ID ${landId} tokenization failed. Check transaction: ${receipt.hash}`);
      }

      return {
        success: true,
        message: `Land ID ${landId} successfully tokenized`,
        data: {
          transactionHash: receipt.hash,
          blockNumber: receipt.blockNumber,
          landId,
          isTokenized: isTokenizedAfter
        }
      };
    } catch (error) {
      console.error(`Error tokenizing land ID ${landId}:`, error);
      return {
        success: false,
        message: `Failed to tokenize land: ${error.message}`,
        error: error.message
      };
    }
  }
}