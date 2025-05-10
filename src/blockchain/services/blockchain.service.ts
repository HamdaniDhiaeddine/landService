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

      // Pour la démo, nous pouvons réduire le prix automatiquement
      // Convertir le prix en ETH, puis le réduire si nécessaire
      let pricePerTokenETH = parseFloat(landData.pricePerToken);

      // Si le prix est trop élevé pour une démo, le réduire (par exemple à 0.01 ETH maximum)
      const maxDemoPrice = 0.01; // Prix maximum pour la démo en ETH
      if (pricePerTokenETH > maxDemoPrice) {
        this.logger.log(`Reducing price for demo from ${pricePerTokenETH} ETH to ${maxDemoPrice} ETH`);
        pricePerTokenETH = maxDemoPrice;
      }

      // Convertir en wei pour le contrat
      const pricePerTokenWei = ethers.parseEther(pricePerTokenETH.toString());

      this.logger.log(`Registering land with ${totalTokens} tokens at ${ethers.formatEther(pricePerTokenWei)} ETH per token`);

      const tx = await this.landRegistry.registerLand(
        landData.location,
        surface,
        totalTokens,
        pricePerTokenWei,
        landData.metadataCID,
        {
          from: landData.owner,
          gasLimit: BigInt(300000)
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
        blockNumber: receipt.blockNumber,
        pricePerToken: ethers.formatEther(pricePerTokenWei), // Renvoyer le prix réellement utilisé
        totalTokens: totalTokens.toString()
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

  public getValidationStatusString(status: number): string {
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

  /**
 * Mint plusieurs tokens pour un terrain donné en une seule transaction
 * @param landId ID du terrain
 * @param quantity Nombre de tokens à minter
 * @param value Montant en ETH à payer pour les tokens (prix total)
 * @returns Détails de la transaction et les IDs des tokens créés
 */
  async mintMultipleTokens(landId: number, quantity: number, value: string): Promise<any> {
    try {
      this.logger.log(`Starting mint multiple tokens process for land ID: ${landId}, quantity: ${quantity}, value: ${value}`);

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

      if (Number(availableTokens) < quantity) {
        throw new Error(`Not enough tokens available for land ID ${landId}. Available: ${availableTokens}, Requested: ${quantity}`);
      }

      // 2. Convertir la valeur en wei
      let valueInWei = value;
      if (!value.includes('e+') && !value.startsWith('0x')) {
        valueInWei = ethers.parseEther(value).toString();
        this.logger.log(`Converted value from ${value} ETH to ${valueInWei} wei`);
      }

      // 3. Vérifier que la valeur est suffisante pour tous les tokens
      const priceInWeiPerToken = pricePerToken; // Déjà en wei depuis le smart contract
      const totalPriceInWei = BigInt(priceInWeiPerToken) * BigInt(quantity);

      if (BigInt(valueInWei) < totalPriceInWei) {
        throw new Error(`Insufficient payment. Required: ${ethers.formatEther(totalPriceInWei.toString())} ETH, Provided: ${ethers.formatEther(valueInWei)} ETH`);
      }

      // 4. Appeler le smart contract
      this.logger.log(`Calling mintMultipleTokens with landId: ${landId}, quantity: ${quantity}, value: ${valueInWei} wei`);

      // Créer une interface pour encoder les paramètres correctement
      const functionAbi = [
        "function mintMultipleTokens(uint256 _landId, uint256 _quantity) payable returns (uint256[])"
      ];
      const iface = new ethers.Interface(functionAbi);

      // Encoder les données d'appel
      const encodedData = iface.encodeFunctionData("mintMultipleTokens", [landId, quantity]);
      this.logger.log(`Encoded function data: ${encodedData}`);

      // Obtenir l'adresse du contrat
      const contractAddress = await this.landToken.getAddress();

      // Envoyer la transaction avec les données encodées
      const tx = await this.landToken.runner.sendTransaction({
        to: contractAddress,
        data: encodedData,
        value: BigInt(valueInWei),
        gasLimit: BigInt(1000000)  // Augmenter la limite de gaz pour garantir l'exécution
      });
      // 5. Attendre la confirmation
      this.logger.log(`Transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();

      // 6. Rechercher l'événement TokensBatchMinted
      let tokenIds = [];

      // Créer une interface pour les événements
      const eventsAbi = [
        "event TokensBatchMinted(uint256 indexed landId, address indexed recipient, uint256 quantity, uint256[] tokenIds)",
        "event TokenMinted(uint256 indexed landId, uint256 indexed tokenId, address owner)"
      ];
      const eventsInterface = new ethers.Interface(eventsAbi);

      // Parcourir les logs pour trouver les événements
      for (const log of receipt.logs) {
        try {
          // Essayer de décoder le log
          const parsedLog = eventsInterface.parseLog({
            topics: log.topics,
            data: log.data
          });

          if (parsedLog && parsedLog.name === 'TokensBatchMinted') {
            // Le 4ème argument contient le tableau des IDs
            const mintedTokenIds = parsedLog.args[3];
            tokenIds = [...mintedTokenIds].map(id => id.toString());
            this.logger.log(`Found TokensBatchMinted event with ${mintedTokenIds.length} tokens`);
            break;
          }
          else if (parsedLog && parsedLog.name === 'TokenMinted') {
            // Le 2ème argument contient l'ID du token
            tokenIds.push(parsedLog.args[1].toString());
            this.logger.log(`Found TokenMinted event for token ID ${parsedLog.args[1]}`);
          }
        } catch (parseError) {
          // Ce log n'est pas un événement que nous cherchons - ignorer l'erreur
        }
      }

      this.logger.log(`Found ${tokenIds.length} token IDs: ${tokenIds.join(', ')}`);

      // 7. Journaliser le succès
      this.logger.log(`Tokens minted successfully for land ID ${landId}`, {
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        tokenIds: tokenIds,
        quantity: quantity
      });

      return {
        hash: receipt.hash,
        blockNumber: receipt.blockNumber,
        tokenIds: tokenIds,
        landId,
        quantity
      };
    } catch (error) {
      this.logger.error(`Error minting multiple tokens for land ID ${landId}:`, error);

      // Améliorer le message d'erreur selon le type d'erreur
      let errorMessage = `Error minting multiple tokens: ${error.message}`;

      if (error.message.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds to cover the price of tokens and gas fees';
      } else if (error.message.includes('LandNotTokenized')) {
        errorMessage = 'The land is not tokenized yet';
      } else if (error.message.includes('LandNotValidated')) {
        errorMessage = 'The land is not validated yet';
      } else if (error.message.includes('NoTokensAvailable')) {
        errorMessage = 'Not enough tokens available for this land';
      } else if (error.message.includes('InsufficientPayment')) {
        errorMessage = 'Insufficient payment to buy the tokens';
      }

      throw new Error(errorMessage);
    }
  }

  /**
   * Mint plusieurs tokens pour un utilisateur spécifié
   * @param landId ID du terrain
   * @param recipient Adresse Ethereum qui recevra les tokens
   * @param quantity Nombre de tokens à minter
   * @param value Montant en ETH à payer pour les tokens
   * @returns Détails de la transaction
   */
  async mintMultipleTokensForUser(landId: number, recipient: string, quantity: number, value: string): Promise<any> {
    try {
      this.logger.log(`Minting ${quantity} tokens for land ID ${landId} to recipient ${recipient} with value ${value}`);

      // Vérifier que l'adresse du destinataire est valide
      if (!ethers.isAddress(recipient)) {
        throw new Error(`Invalid recipient address: ${recipient}`);
      }

      // Convertir la valeur ETH en wei
      const valueInWei = ethers.parseEther(value);

      // Appeler la fonction mintMultipleTokensForUser du contrat
      const tx = await this.landToken.mintMultipleTokensForUser(landId, recipient, quantity, {
        value: valueInWei,
        gasLimit: BigInt(500000)
      });

      const receipt = await tx.wait();

      this.logger.log(`${quantity} tokens minted successfully for land ID ${landId} to ${recipient}`);
      this.logger.log(`Transaction hash: ${receipt.hash}`);

      // Extraire les IDs des tokens depuis l'événement
      let tokenIds = [];
      const event = receipt.logs.find(
        log => log.eventName === 'TokensBatchMinted'
      );

      if (event) {
        tokenIds = event.args[3].map(tokenId => tokenId.toString());
      }

      return {
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        tokenIds: tokenIds,
        recipient: recipient,
        landId: landId,
        quantity: quantity
      };
    } catch (error) {
      this.logger.error(`Error minting multiple tokens for user: ${error.message}`);
      throw new Error(`Failed to mint multiple tokens: ${error.message}`);
    }
  }
  /**
 * Récupère les informations sur les frais de plateforme
 * @returns Le pourcentage de frais actuel et les paramètres de calcul
 */
  async getPlatformFeeInfo(): Promise<any> {
    try {
      const platformFeePercentage = await this.landToken.platformFeePercentage();
      const percentageBase = await this.landToken.PERCENTAGE_BASE();

      const feePercentage = (Number(platformFeePercentage) / Number(percentageBase)) * 100;

      return {
        platformFeePercentage: Number(platformFeePercentage),
        percentageBase: Number(percentageBase),
        formattedPercentage: `${feePercentage.toFixed(2)}%`,
        feeExample: {
          paymentAmount: "1.0 ETH",
          platformFee: `${(feePercentage / 100).toFixed(4)} ETH`,
          ownerReceives: `${(1 - feePercentage / 100).toFixed(4)} ETH`
        }
      };
    } catch (error) {
      this.logger.error('Error getting platform fee info:', error);
      throw new Error(`Failed to get platform fee info: ${error.message}`);
    }
  }

  //Marketplace
  /**
 * Récupère tous les tokens possédés par une adresse spécifique
 * @param ownerAddress Adresse ETH du propriétaire
 * @returns Liste des tokens avec leurs détails
 */
  async getUserTokens(ownerAddress: string) {
    try {
      if (!ethers.isAddress(ownerAddress)) {
        throw new Error('Adresse Ethereum invalide');
      }

      this.logger.log(`[${this.formatDate()}] Recherche des tokens pour l'adresse: ${ownerAddress}`);

      const userTokens = [];
      const MAX_TOKEN_ID_TO_CHECK = 1000; // Limite arbitraire, à ajuster selon votre cas d'utilisation

      this.logger.log(`[${this.formatDate()}] Analyse des tokens de 1 à ${MAX_TOKEN_ID_TO_CHECK}`);

      // Parcourir tous les IDs de tokens possibles 
      for (let tokenId = 1; tokenId <= MAX_TOKEN_ID_TO_CHECK; tokenId++) {
        try {
          // Vérifier si le token existe via la méthode exists()
          const exists = await this.landToken.exists(tokenId);
          if (!exists) continue;

          // Vérifier le propriétaire
          const owner = await this.landToken.ownerOf(tokenId);

          if (owner.toLowerCase() === ownerAddress.toLowerCase()) {
            // Récupérer les données du token
            const tokenData = await this.landToken.tokenData(tokenId);

            // Récupérer les détails du terrain associé
            const landId = Number(tokenData.landId);

            // Vérifier si le token est listé sur le marketplace
            const listing = await this.marketplace.listings(tokenId);

            userTokens.push({
              tokenId: tokenId,
              landId: landId,
              tokenNumber: Number(tokenData.tokenNumber),
              purchasePrice: ethers.formatEther(tokenData.purchasePrice),
              mintDate: new Date(Number(tokenData.mintDate) * 1000).toISOString(),
              isListed: listing.isActive,
              listingPrice: listing.isActive ? ethers.formatEther(listing.price) : null,
              seller: listing.isActive ? listing.seller : null
            });
          }
        } catch (error) {
          // Ignorer les erreurs pour les tokens individuels
          continue;
        }
      }

      this.logger.log(`[${this.formatDate()}] Trouvé ${userTokens.length} tokens pour l'adresse ${ownerAddress}`);

      // Pour chaque token, compléter avec les infos du terrain
      for (const token of userTokens) {
        try {
          const landDetails = await this.landRegistry.getAllLandDetails(token.landId);
          token.land = {
            location: landDetails[0],
            surface: Number(landDetails[1]),
            owner: landDetails[2],
            isRegistered: landDetails[3],
            status: this.getValidationStatusString(Number(landDetails[5])),
            totalTokens: Number(landDetails[6]),
            availableTokens: Number(landDetails[7]),
            pricePerToken: ethers.formatEther(landDetails[8])
          };
        } catch (error) {
          this.logger.warn(`[${this.formatDate()}] Erreur lors de la récupération des détails du terrain ${token.landId}: ${error.message}`);
          token.land = null;
        }
      }

      return {
        success: true,
        data: userTokens,
        count: userTokens.length,
        message: `Récupéré ${userTokens.length} tokens pour l'adresse ${ownerAddress}`,
        timestamp: this.formatDate()
      };
    } catch (error) {
      this.logger.error(`Erreur lors de la récupération des tokens utilisateur: ${error.message}`);
      throw new Error(`Échec de la récupération des tokens: ${error.message}`);
    }
  }



  /**
 * Obtient la plage de token IDs active (min et max)
 * Cette méthode évite de vérifier tous les tokens potentiels
 */
  async getTokenIdRange() {
    try {
      this.logger.log(`[2025-05-05 09:23:17] nesssim - Récupération de la plage de tokens actifs`);

      const landToken = this.getLandToken();

      // Essayer d'obtenir le dernier token ID via une approche binaire
      let maxTokenId = await this.findMaxTokenIdBinary();

      this.logger.log(`[2025-05-05 09:23:17] nesssim - Plage de tokens trouvée: 1 à ${maxTokenId}`);

      return {
        min: 1,
        max: maxTokenId
      };
    } catch (error) {
      this.logger.error(`[2025-05-05 09:23:17] nesssim - Erreur lors de la récupération de la plage de tokens: ${error.message}`);
      return { min: 1, max: 200 }; // Valeurs par défaut en cas d'erreur
    }
  }

  /**
   * Utilise une recherche binaire pour trouver rapidement le token ID maximum
   * Beaucoup plus efficace que de vérifier chaque token séquentiellement
   */
  private async findMaxTokenIdBinary(upperBound = 1000) {
    let left = 1;
    let right = upperBound;
    const landToken = this.getLandToken();

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);

      try {
        // Vérifier si le token au milieu existe
        await landToken.ownerOf(mid);
        // Si nous sommes ici, le token existe, donc chercher à droite
        left = mid + 1;
      } catch (error) {
        // Le token n'existe pas, chercher à gauche
        right = mid - 1;
      }
    }

    return right; // Le dernier token valide
  }

  /**
   * Récupère efficacement les propriétaires d'un lot de tokens
   * @param tokenIds Liste des IDs de tokens à vérifier
   * @returns Map associant chaque tokenId à son propriétaire (si le token existe)
   */
  async getTokenOwners(tokenIds: number[]): Promise<Record<number, string>> {
    try {
      this.logger.log(` Récupération des propriétaires pour ${tokenIds.length} tokens`);

      const landToken = this.getLandToken();
      const ownersMap: Record<number, string> = {};

      // Traiter les requêtes en parallèle par petits groupes
      const PARALLEL_BATCH_SIZE = 5;
      for (let i = 0; i < tokenIds.length; i += PARALLEL_BATCH_SIZE) {
        const batch = tokenIds.slice(i, i + PARALLEL_BATCH_SIZE);

        // Créer des promesses pour chaque token du lot
        const ownerPromises = batch.map(async (tokenId) => {
          try {
            const owner = await landToken.ownerOf(tokenId);
            return { tokenId, owner };
          } catch (error) {
            // Token n'existe pas ou autre erreur
            return { tokenId, owner: null };
          }
        });

        // Attendre toutes les promesses du lot
        const results = await Promise.all(ownerPromises);

        // Mettre à jour la carte des propriétaires
        results.forEach(({ tokenId, owner }) => {
          if (owner) {
            ownersMap[tokenId] = owner;
          }
        });
      }

      return ownersMap;
    } catch (error) {
      this.logger.error(`[2025-05-05 09:23:17] nesssim - Erreur lors de la récupération des propriétaires: ${error.message}`);
      return {};
    }
  }
  /**
   * Construit efficacement un index des tokens actuellement listés sur le marketplace
   * en utilisant les événements blockchain
   */
  async buildTokenIndex() {
    try {
      this.logger.log(`[2025-05-05 09:23:17] nesssim - Construction de l'index des tokens du marketplace`);

      // Récupérer le provider et le contrat marketplace
      const provider = this.getProvider();
      const marketplace = this.getMarketplace();

      // Obtenir le bloc actuel et calculer le bloc de départ (10000 blocs en arrière)
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 10000);

      this.logger.log(`[2025-05-05 09:23:17] nesssim - Recherche d'événements du bloc ${fromBlock} au bloc ${currentBlock}`);

      // Créer une interface pour les événements
      const eventInterface = new ethers.Interface([
        "event TokenListed(uint256 indexed tokenId, uint256 price, address indexed seller)",
        "event TokenSold(uint256 indexed tokenId, address indexed buyer, address indexed seller)",
        "event ListingCancelled(uint256 indexed tokenId, address indexed seller)"
      ]);

      // Récupérer les événements pertinents
      const [listedEvents, soldEvents, cancelledEvents] = await Promise.all([
        // Événements de mise en vente
        provider.getLogs({
          address: marketplace.target,
          topics: [ethers.id("TokenListed(uint256,uint256,address)")],
          fromBlock,
          toBlock: currentBlock
        }),
        // Événements de vente
        provider.getLogs({
          address: marketplace.target,
          topics: [ethers.id("TokenSold(uint256,address,address)")],
          fromBlock,
          toBlock: currentBlock
        }),
        // Événements d'annulation
        provider.getLogs({
          address: marketplace.target,
          topics: [ethers.id("ListingCancelled(uint256,address)")],
          fromBlock,
          toBlock: currentBlock
        })
      ]);

      this.logger.log(`[2025-05-05 09:23:17] nesssim - Événements trouvés: ${listedEvents.length} listings, ${soldEvents.length} ventes, ${cancelledEvents.length} annulations`);

      // Créer un map pour suivre l'état de chaque token
      const tokenStatusMap: Record<string, {
        isListed: boolean;
        price?: string;
        seller?: string;
        listingBlock?: number;
        listingTxHash?: string;
        blockTimestamp?: number;
      }> = {};

      // Traiter les événements dans l'ordre chronologique (blocs)

      // 1. Traiter les mises en vente
      for (const event of listedEvents) {
        try {
          const parsed = eventInterface.parseLog({
            topics: event.topics,
            data: event.data
          });

          const tokenId = parsed.args[0].toString();
          const price = parsed.args[1];
          const seller = parsed.args[2];

          // Récupérer le timestamp du bloc si nécessaire
          let blockTimestamp;
          try {
            const block = await provider.getBlock(event.blockNumber);
            blockTimestamp = block ? Number(block.timestamp) : undefined;
          } catch (error) {
            blockTimestamp = undefined;
          }

          tokenStatusMap[tokenId] = {
            isListed: true,
            price: ethers.formatEther(price),
            seller: seller,
            listingBlock: event.blockNumber,
            listingTxHash: event.transactionHash,
            blockTimestamp
          };
        } catch (error) {
          continue; // Ignorer les erreurs individuelles
        }
      }

      // 2. Mettre à jour d'après les ventes (marquer comme non listés)
      for (const event of soldEvents) {
        try {
          const parsed = eventInterface.parseLog({
            topics: event.topics,
            data: event.data
          });

          const tokenId = parsed.args[0].toString();

          if (tokenStatusMap[tokenId]) {
            tokenStatusMap[tokenId].isListed = false;
          }
        } catch (error) {
          continue;
        }
      }

      // 3. Mettre à jour d'après les annulations (marquer comme non listés)
      for (const event of cancelledEvents) {
        try {
          const parsed = eventInterface.parseLog({
            topics: event.topics,
            data: event.data
          });

          const tokenId = parsed.args[0].toString();

          if (tokenStatusMap[tokenId]) {
            tokenStatusMap[tokenId].isListed = false;
          }
        } catch (error) {
          continue;
        }
      }

      // Construire l'index final des tokens listés actifs
      const tokenIndex = [];

      for (const [tokenId, status] of Object.entries(tokenStatusMap)) {
        if (status.isListed) {
          tokenIndex.push({
            tokenId: parseInt(tokenId),
            price: status.price,
            seller: status.seller,
            listingBlock: status.listingBlock,
            listingTxHash: status.listingTxHash,
            listingDate: status.blockTimestamp ? new Date(status.blockTimestamp * 1000) : undefined
          });
        }
      }

      this.logger.log(`[2025-05-05 09:23:17] nesssim - Index construit avec ${tokenIndex.length} tokens listés actifs`);
      return tokenIndex;
    } catch (error) {
      this.logger.error(`[2025-05-05 09:23:17] nesssim - Erreur lors de la construction de l'index: ${error.message}`);
      return [];
    }
  }

  async getWalletAddress(): Promise<string> {
    return await this.signer.getAddress();
  }

  /**
   * Récupère les détails de plusieurs tokens en parallèle
   * @param tokenIds Liste des IDs de tokens
   * @returns Détails des tokens
   */
  async getMultipleTokensDetails(tokenIds: number[]) {
    if (!tokenIds || tokenIds.length === 0) return [];

    this.logger.log(` Récupération des détails pour ${tokenIds.length} tokens`);

    const landToken = this.getLandToken();
    const marketplace = this.getMarketplace();

    // Récupérer les détails en parallèle par lots
    const BATCH_SIZE = 5;
    const allResults = [];

    for (let i = 0; i < tokenIds.length; i += BATCH_SIZE) {
      const batch = tokenIds.slice(i, i + BATCH_SIZE);

      const batchPromises = batch.map(async (tokenId) => {
        try {
          // Pour chaque token, récupérer ses données et son état de listing en parallèle
          const [tokenData, listing] = await Promise.all([
            landToken.tokenData(tokenId),
            marketplace.listings(tokenId)
          ]);

          return {
            tokenId,
            landId: Number(tokenData.landId),
            tokenNumber: Number(tokenData.tokenNumber),
            purchasePrice: ethers.formatEther(tokenData.purchasePrice),
            mintDate: new Date(Number(tokenData.mintDate) * 1000).toISOString(),
            isListed: listing.isActive,
            listingPrice: listing.isActive ? ethers.formatEther(listing.price) : null,
            seller: listing.isActive ? listing.seller : null
          };
        } catch (error) {
          this.logger.warn(`[2025-05-05 09:23:17] nesssim - Erreur lors de la récupération des détails du token ${tokenId}: ${error.message}`);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      allResults.push(...batchResults.filter(Boolean));
    }

    return allResults;
  }


  /**
   * Liste un token à vendre sur le marketplace
   * @param tokenId ID du token à vendre
   * @param price Prix en ETH (sous forme de chaîne)
   * @returns Détails de la transaction
   */
  async listTokenForSale(tokenId: number, price: string) {
    try {
      this.logger.log(`[${this.formatDate()}] Mise en vente du token ${tokenId} au prix de ${price} ETH`);

      // Vérifier si le token existe
      const exists = await this.landToken.exists(tokenId);
      if (!exists) {
        throw new Error(`Le token ${tokenId} n'existe pas`);
      }

      // Vérifier si l'utilisateur est propriétaire du token
      const owner = await this.landToken.ownerOf(tokenId);
      const signerAddress = await this.signer.getAddress();

      if (owner.toLowerCase() !== signerAddress.toLowerCase()) {
        throw new Error(`L'utilisateur n'est pas le propriétaire du token ${tokenId}`);
      }

      // Vérifier si le token est déjà listé
      const listing = await this.marketplace.listings(tokenId);
      if (listing.isActive) {
        throw new Error(`Le token ${tokenId} est déjà en vente`);
      }

      // Convertir le prix en wei
      const priceInWei = ethers.parseEther(price);

      // Approuver le marketplace pour gérer le token si ce n'est pas déjà fait
      const isApproved = await this.landToken.isApprovedForAll(signerAddress, this.marketplace.target);
      if (!isApproved) {
        this.logger.log(`[${this.formatDate()}] Approbation du marketplace pour gérer les tokens`);
        const approveTx = await this.landToken.setApprovalForAll(this.marketplace.target, true);
        await approveTx.wait();
        this.logger.log(`[${this.formatDate()}] Marketplace approuvé pour les transferts de tokens`);
      }

      // Mettre le token en vente
      const tx = await this.marketplace.listToken(tokenId, priceInWei);
      const receipt = await tx.wait();

      // Récupérer les détails du token
      const tokenData = await this.landToken.tokenData(tokenId);
      const landId = Number(tokenData.landId);

      return {
        success: true,
        data: {
          transactionHash: receipt.hash,
          blockNumber: receipt.blockNumber,
          tokenId: tokenId,
          landId: landId,
          price: price,
          seller: signerAddress,
          timestamp: this.formatDate()
        },
        message: `Token ${tokenId} mis en vente avec succès au prix de ${price} ETH`
      };
    } catch (error) {
      this.logger.error(`Erreur lors de la mise en vente du token: ${error.message}`);
      throw new Error(`Échec de la mise en vente: ${error.message}`);
    }
  }

  /**
   * Annule la mise en vente d'un token
   * @param tokenId ID du token
   * @returns Détails de la transaction
   */
  async cancelListing(tokenId: number) {
    try {
      this.logger.log(`[${this.formatDate()}] Annulation de la mise en vente du token ${tokenId}`);

      // Vérifier si le token est bien listé
      const listing = await this.marketplace.listings(tokenId);

      if (!listing.isActive) {
        throw new Error(`Le token ${tokenId} n'est pas en vente`);
      }

      // Vérifier que l'utilisateur est bien le vendeur
      const seller = listing.seller;
      const signerAddress = await this.signer.getAddress();

      if (seller.toLowerCase() !== signerAddress.toLowerCase()) {
        throw new Error('Seul le vendeur peut annuler la mise en vente');
      }

      // Annuler la mise en vente
      const tx = await this.marketplace.cancelListing(tokenId);
      const receipt = await tx.wait();

      return {
        success: true,
        data: {
          transactionHash: receipt.hash,
          blockNumber: receipt.blockNumber,
          tokenId: tokenId,
          seller: signerAddress,
          timestamp: this.formatDate()
        },
        message: `Mise en vente du token ${tokenId} annulée avec succès`
      };
    } catch (error) {
      this.logger.error(`Erreur lors de l'annulation de la mise en vente: ${error.message}`);
      throw new Error(`Échec de l'annulation: ${error.message}`);
    }
  }

  /**
   * Permet à un relayer d'acheter un token pour un utilisateur
   * @param tokenId ID du token à acheter
   * @param buyer Adresse de l'acheteur
   * @param value Montant en ETH à payer
   * @returns Détails de la transaction
   */
  async buyTokenForUser(tokenId: number, buyer: string, value: string) {
    try {
      if (!ethers.isAddress(buyer)) {
        throw new Error('Adresse de l\'acheteur invalide');
      }

      this.logger.log(`[${this.formatDate()}] Achat du token ${tokenId} pour l'utilisateur ${buyer} avec ${value} ETH`);

      // Vérifier que le token est bien listé
      const listing = await this.marketplace.listings(tokenId);

      if (!listing.isActive) {
        throw new Error(`Le token ${tokenId} n'est pas en vente`);
      }

      // Convertir le prix en wei
      const valueInWei = ethers.parseEther(value);
      const listingPrice = listing.price;

      // Vérifier que le montant est suffisant
      if (valueInWei < listingPrice) {
        const requiredEth = ethers.formatEther(listingPrice);
        throw new Error(`Paiement insuffisant. Requis: ${requiredEth} ETH, Fourni: ${value} ETH`);
      }

      // Acheter le token pour l'utilisateur
      const tx = await this.marketplace.buyTokenForUser(tokenId, buyer, { value: valueInWei });
      const receipt = await tx.wait();

      // Récupérer les données du token acheté
      const tokenData = await this.landToken.tokenData(tokenId);
      const landId = Number(tokenData.landId);

      return {
        success: true,
        data: {
          transactionHash: receipt.hash,
          blockNumber: receipt.blockNumber,
          tokenId: tokenId,
          landId: landId,
          price: ethers.formatEther(listingPrice),
          buyer: buyer,
          seller: listing.seller,
          timestamp: this.formatDate()
        },
        message: `Token ${tokenId} acheté avec succès pour ${ethers.formatEther(listingPrice)} ETH pour l'utilisateur ${buyer}`
      };
    } catch (error) {
      this.logger.error(`Erreur lors de l'achat du token pour l'utilisateur: ${error.message}`);
      throw new Error(`Échec de l'achat pour l'utilisateur: ${error.message}`);
    }
  }

  // Méthode utilitaire pour formater la date
  private formatDate(): string {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
  }

  async getMarketplaceListings() {
    try {
      this.logger.log(`Récupération des listings du marketplace`);

      // 1. Obtenir directement la liste des tokens actifs depuis le contrat
      const activeListingIdsRaw = await this.marketplace.getAllActiveListings();

      // Convertir en tableau standard pour éviter les problèmes de propriétés en lecture seule
      const activeListingIds = [...activeListingIdsRaw].map(id => Number(id));

      if (activeListingIds.length === 0) {
        return {
          success: true,
          data: [],
          count: 0,
          message: 'Aucun token en vente trouvé sur le marketplace',
          timestamp: this.formatDate()
        };
      }

      this.logger.log(`[${this.formatDate()}] nesssim - Plage de tokens trouvée: ${Math.min(...activeListingIds)} à ${Math.max(...activeListingIds)}`);

      // 2. Obtenir les détails de tous les listings en une seule requête
      const [prices, sellers, isActives, timestamps] =
        await this.marketplace.getMultipleListingDetails(activeListingIds);

      // 3. Préparer le traitement par lots des données de tokens
      const activeTokensData = [];
      const batchSize = 20; // Traiter 20 tokens à la fois
      const landIds = new Set(); // Pour stocker tous les IDs de terrain uniques

      // 4. Traiter les tokens par lots pour éviter de surcharger le fournisseur
      for (let i = 0; i < activeListingIds.length; i += batchSize) {
        const batchTokenIds = activeListingIds.slice(i, Math.min(i + batchSize, activeListingIds.length));

        const batchPromises = batchTokenIds.map(async (tokenId, batchIndex) => {
          const index = i + batchIndex;

          // Vérifier si le listing est actif
          if (!isActives[index]) return null;

          try {
            // Récupérer les données du token
            const tokenData = await this.landToken.tokenData(tokenId);
            const landId = Number(tokenData.landId);
            landIds.add(landId); // Ajouter à l'ensemble des terrains

            return {
              tokenId: tokenId,
              landId: landId,
              price: ethers.formatEther(prices[index]),
              seller: sellers[index],
              tokenNumber: Number(tokenData.tokenNumber),
              purchasePrice: ethers.formatEther(tokenData.purchasePrice),
              mintDate: new Date(Number(tokenData.mintDate) * 1000).toISOString(),
              listingTimestamp: Number(timestamps[index]),
              tokenData: {
                tokenNumber: Number(tokenData.tokenNumber),
                purchasePrice: ethers.formatEther(tokenData.purchasePrice),
                mintDate: new Date(Number(tokenData.mintDate) * 1000).toISOString()
              },
              land: null // Sera rempli plus tard
            };
          } catch (error) {
            this.logger.warn(`Erreur lors de la récupération des données du token ${tokenId}: ${error.message}`);
            return null;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        activeTokensData.push(...batchResults.filter(Boolean));
      }

      // 5. Récupérer les détails des terrains par lots
      const landDetailsMap = new Map();
      const landIdsArray = Array.from(landIds);

      for (let i = 0; i < landIdsArray.length; i += batchSize) {
        const batchLandIds = landIdsArray.slice(i, Math.min(i + batchSize, landIdsArray.length));

        const batchPromises = batchLandIds.map(async (landId) => {
          try {
            const landDetails = await this.landRegistry.getAllLandDetails(landId);
            return {
              landId,
              details: {
                location: landDetails[0],
                surface: Number(landDetails[1]),
                owner: landDetails[2],
                isRegistered: landDetails[3],
                status: this.getValidationStatusString(Number(landDetails[5])),
                totalTokens: Number(landDetails[6]),
                availableTokens: Number(landDetails[7]),
                pricePerToken: ethers.formatEther(landDetails[8])
              }
            };
          } catch (error) {
            this.logger.warn(`Erreur lors de la récupération des détails du terrain ${landId}: ${error.message}`);
            return { landId, details: null };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach(result => {
          if (result.details) {
            landDetailsMap.set(result.landId, result.details);
          }
        });
      }

      // 6. Compléter les données des tokens avec les détails des terrains
      activeTokensData.forEach(token => {
        if (landDetailsMap.has(token.landId)) {
          token.land = landDetailsMap.get(token.landId);
        }
      });

      this.logger.log(`[${this.formatDate()}] nesssim - Récupéré ${activeTokensData.length} tokens en vente`);

      return {
        success: true,
        data: activeTokensData,
        count: activeTokensData.length,
        message: `Récupéré ${activeTokensData.length} tokens en vente sur le marketplace`,
        timestamp: this.formatDate()
      };
    } catch (error) {
      this.logger.error(`Erreur lors de la récupération des listings: ${error.message}`);
      throw new Error(`Échec de la récupération des listings: ${error.message}`);
    }
  }

  async getUserListedTokens(ethAddress: string) {
    try {
      if (!ethers.isAddress(ethAddress)) {
        throw new Error('Adresse Ethereum invalide');
      }

      this.logger.log(`Récupération des tokens mis en vente par l'utilisateur: ${ethAddress}`);

      // 1. Utiliser la méthode optimisée pour obtenir directement les tokens listés par l'utilisateur
      const userListedTokenIds = await this.marketplace.getListingsByUser(ethAddress);

      if (userListedTokenIds.length === 0) {
        return {
          success: true,
          data: [],
          count: 0,
          message: `Aucun token mis en vente trouvé pour l'adresse ${ethAddress}`,
        };
      }

      // 2. Obtenir les détails des listings en une seule requête
      const [prices, sellers, isActives, timestamps] =
        await this.marketplace.getMultipleListingDetails(userListedTokenIds);

      // 3. Préparer le traitement par lots
      const listedTokens = [];
      const landIds = new Set();
      const batchSize = 20;

      // 4. Récupérer les données des tokens par lots
      for (let i = 0; i < userListedTokenIds.length; i += batchSize) {
        const batch = userListedTokenIds.slice(i, Math.min(i + batchSize, userListedTokenIds.length));
        const batchPromises = batch.map(async (tokenId, batchIndex) => {
          const index = i + batchIndex;
          if (!isActives[index]) return null; // Ignorer les inactifs

          try {
            // Récupérer les données du token
            const tokenData = await this.landToken.tokenData(tokenId);
            const landId = Number(tokenData.landId);
            landIds.add(landId);

            return {
              tokenId: Number(tokenId),
              landId: landId,
              price: ethers.formatEther(prices[index]),
              seller: ethAddress,
              tokenData: {
                tokenNumber: Number(tokenData.tokenNumber),
                purchasePrice: ethers.formatEther(tokenData.purchasePrice),
                mintDate: new Date(Number(tokenData.mintDate) * 1000).toISOString()
              },
              listingTimestamp: Number(timestamps[index]),
              listingDate: new Date(Number(timestamps[index]) * 1000).toISOString(),
              land: null // Sera rempli plus tard
            };
          } catch (error) {
            this.logger.warn(`Erreur lors de la récupération des données du token ${tokenId}: ${error.message}`);
            return null;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        listedTokens.push(...batchResults.filter(Boolean));
      }

      return {
        success: true,
        data: listedTokens,
        count: listedTokens.length,
        message: `Récupéré ${listedTokens.length} tokens mis en vente par l'utilisateur ${ethAddress}`,
      };
    } catch (error) {
      this.logger.error(`Erreur lors de la récupération des tokens mis en vente: ${error.message}`);
      throw new Error(`Échec de la récupération des tokens mis en vente: ${error.message}`);
    }
  }
}
