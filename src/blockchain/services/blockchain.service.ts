import { Injectable, OnModuleInit } from '@nestjs/common';
import { Contract, JsonRpcProvider, Wallet, Interface, InterfaceAbi } from 'ethers';
import { blockchainConfig } from '../config/blockchain.config';
import LandRegistryJSON from '../abis/LandRegistry.json';
import LandTokenJSON from '../abis/LandToken.json';
import LandTokenMarketplaceJSON from '../abis/LandTokenMarketplace.json';

@Injectable()
export class BlockchainService implements OnModuleInit {
  private provider: JsonRpcProvider;
  private signer: Wallet;
  private landRegistry: Contract;
  private landToken: Contract;
  private marketplace: Contract;

  // Clé privée pour le développement (à déplacer dans les variables d'environnement)
  private readonly PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // Clé privée du premier compte Hardhat

  async onModuleInit() {
    await this.initializeBlockchain();
  }

  private async initializeBlockchain() {
    try {
      // Initialiser le provider et le signer
      this.provider = new JsonRpcProvider(blockchainConfig.provider.local);
      this.signer = new Wallet(this.PRIVATE_KEY, this.provider);

      // Créer les interfaces à partir des ABIs
      const landRegistryInterface = new Interface(LandRegistryJSON.abi as InterfaceAbi);
      const landTokenInterface = new Interface(LandTokenJSON.abi as InterfaceAbi);
      const marketplaceInterface = new Interface(LandTokenMarketplaceJSON.abi as InterfaceAbi);

      // Initialiser les contrats avec les interfaces
      this.landRegistry = new Contract(
        blockchainConfig.contracts.LandRegistry.address,
        landRegistryInterface,
        this.signer
      );

      this.landToken = new Contract(
        blockchainConfig.contracts.LandToken.address,
        landTokenInterface,
        this.signer
      );

      this.marketplace = new Contract(
        blockchainConfig.contracts.LandTokenMarketplace.address,
        marketplaceInterface,
        this.signer
      );

      console.log('Blockchain service initialized successfully');
    } catch (error) {
      console.error('Error initializing blockchain service:', error);
      throw error;
    }
  }


  // Méthodes Land Registry
  async registerLand(location: string, surface: number, totalTokens: number, pricePerToken: string, cid: string) {
    try {
      const tx = await this.landRegistry.registerLand(
        location,
        surface,
        totalTokens,
        pricePerToken,
        cid
      );
      const receipt = await tx.wait();
      console.log('Land registered successfully:', receipt.hash);
      return receipt;
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