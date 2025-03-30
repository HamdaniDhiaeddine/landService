import { Injectable, OnModuleInit } from '@nestjs/common';
import { Contract, JsonRpcProvider, Wallet, Interface, InterfaceAbi, ethers } from 'ethers';
import { blockchainConfig } from '../config/blockchain.config';
import LandRegistryJSON from '../abis/LandRegistry.json';
import LandTokenJSON from '../abis/LandToken.json';
import LandTokenMarketplaceJSON from '../abis/LandTokenMarketplace.json';
import { ConfigService } from '@nestjs/config';

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

  private async initializeBlockchain() {
    try {
      // Forcer l'utilisation de Sepolia
      console.log('Initializing contracts on Sepolia network...');

      const rpcUrl = this.configService.get<string>('SEPOLIA_RPC_URL');
      if (!rpcUrl) {
        throw new Error('SEPOLIA_RPC_URL not configured');
      }

      // Initialiser le provider avec Sepolia
      this.provider = new JsonRpcProvider(rpcUrl);

      // Attendre que le provider soit prêt
      await this.provider.ready;
      const network = await this.provider.getNetwork();
      console.log('Connected to network:', network.name);

      // Vérifier la clé privée
      const privateKey = this.configService.get<string>('PRIVATE_KEY');
      if (!privateKey) {
        throw new Error('PRIVATE_KEY not configured');
      }

      this.signer = new Wallet(privateKey, this.provider);
      console.log('Signer address:', await this.signer.getAddress());

      // Vérifier les adresses des contrats
      const registryAddress = this.configService.get<string>('LAND_REGISTRY_ADDRESS');
      const tokenAddress = this.configService.get<string>('LAND_TOKEN_ADDRESS');
      const marketplaceAddress = this.configService.get<string>('MARKETPLACE_ADDRESS');

      if (!registryAddress || !tokenAddress || !marketplaceAddress) {
        throw new Error('Contract addresses not properly configured');
      }

      // Initialiser les contrats avec les adresses de Sepolia
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

      // Vérifier la connexion aux contrats
      await this.verifyContracts();

      console.log('Blockchain service initialized successfully on Sepolia');
    } catch (error) {
      console.error('Error initializing blockchain service:', error);
      throw error;
    }
  }

  private async verifyContracts() {
    try {
      // Vérifier LandRegistry
      const registryOwner = await this.landRegistry.owner();
      console.log('LandRegistry connected at:', this.landRegistry.target);
      console.log('LandRegistry owner:', registryOwner);

      // Vérifier LandToken
      const tokenName = await this.landToken.name();
      console.log('LandToken connected at:', this.landToken.target);
      console.log('Token name:', tokenName);

      // Vérifier Marketplace
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
    owner: string;          // Adresse Ethereum du propriétaire
    metadataCID: string;    // CID IPFS avec les métadonnées complètes
  }) {
    try {
      // Vérification des données
      if (!landData.owner || !ethers.isAddress(landData.owner)) {
        throw new Error('Invalid owner address');
      }

      // Conversion des valeurs pour la blockchain
      const surface = BigInt(landData.surface);
      const totalTokens = BigInt(landData.totalTokens);
      const pricePerToken = ethers.parseEther(landData.pricePerToken);

      // Appel au smart contract avec toutes les informations
      const tx = await this.landRegistry.registerLand(
        landData.location,           // Localisation
        surface,                     // Surface en m²
        totalTokens,                 // Nombre total de tokens
        pricePerToken,              // Prix par token en ETH
        landData.metadataCID,       // CID IPFS pour les métadonnées
        {
          from: landData.owner      // Spécifier l'adresse du propriétaire
        }
      );

      const receipt = await tx.wait();

      // Récupérer l'ID du terrain depuis l'événement
      const event = receipt.logs.find(
        log => log.eventName === 'LandRegistered'
      );

      if (!event) {
        throw new Error('Land registration event not found');
      }

      const landId = event.args[0]; // Premier argument de l'événement est landId

      console.log('Land registered successfully:', {
        landId: landId.toString(),
        txHash: receipt.hash,
        owner: landData.owner,
        block: receipt.blockNumber
      });

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
  
  async getLandDetails(landId: number) {
    try {
      const land = await this.landRegistry.lands(landId);
      return {
        location: land.location,
        surface: Number(land.surface),
        owner: land.owner,
        isRegistered: land.isRegistered,
        registrationDate: Number(land.registrationDate),
        status: Number(land.status),
        totalTokens: Number(land.totalTokens),
        availableTokens: Number(land.availableTokens),
        pricePerToken: land.pricePerToken.toString(),
        isTokenized: land.isTokenized,
        cid: land.cid
      };
    } catch (error) {
      console.error('Error getting land details:', error);
      throw new Error(`Erreur lors de la récupération des détails du terrain: ${error.message}`);
    }
  }

  // Méthodes Land Token
  async mintToken(landId: number, value: string) {
    try {
      const tx = await this.landToken.mintToken(landId, {
        value: value
      });
      const receipt = await tx.wait();
      console.log('Token minted successfully:', receipt.hash);
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
      console.log('Token transferred successfully:', receipt.hash);
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
      console.log('Token listed successfully:', receipt.hash);
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
      console.log('Token bought successfully:', receipt.hash);
      return receipt;
    } catch (error) {
      console.error('Error buying token:', error);
      throw new Error(`Erreur lors de l'achat du token: ${error.message}`);
    }
  }
}