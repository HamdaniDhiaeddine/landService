import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager'; // Importation depuis @nestjs/cache-manager
import { BlockchainService } from 'src/blockchain/services/blockchain.service';
import { Cache } from 'cache-manager';
import { ethers } from 'ethers';

@Injectable()
export class CacheInvalidationService implements OnModuleInit {
  private readonly logger = new Logger(CacheInvalidationService.name);

  constructor(
    private readonly blockchainService: BlockchainService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache
  ) {}

  async onModuleInit() {
    await this.setupEventListeners();
  }

  private async setupEventListeners() {
    try {
      this.logger.log(`[2025-05-05 09:23:17] nesssim - Configuration des écouteurs d'événements blockchain`);
      
      // Obtenir les contrats
      const landToken = this.blockchainService.getLandToken();
      const marketplace = this.blockchainService.getMarketplace();
      
      // Écouter les transferts de tokens
      landToken.on('Transfer', async (from, to, tokenId) => {
        this.logger.log(`[${this.getCurrentDateTime()}] Token ${tokenId} transféré de ${from} à ${to}`);
        
        // Invalider les caches associés
        await this.invalidateUserTokenCaches(from, to);
        await this.invalidateTokenIdRangeCache();
      });
      
      // Écouter les mises en vente
      marketplace.on('TokenListed', async (tokenId, price, seller) => {
        this.logger.log(`[${this.getCurrentDateTime()}] Token ${tokenId} mis en vente pour ${ethers.formatEther(price)} ETH par ${seller}`);
        
        // Invalider les caches associés
        await this.invalidateMarketplaceListingsCache();
        await this.invalidateUserTokenCache(seller);
      });
      
      // Écouter les ventes
      marketplace.on('TokenSold', async (tokenId, buyer, seller) => {
        this.logger.log(`[${this.getCurrentDateTime()}] Token ${tokenId} vendu à ${buyer} par ${seller}`);
        
        // Invalider les caches associés
        await this.invalidateMarketplaceListingsCache();
        await this.invalidateUserTokenCaches(buyer, seller);
      });
      
      // Écouter les annulations de mise en vente
      marketplace.on('ListingCancelled', async (tokenId, seller) => {
        this.logger.log(`[${this.getCurrentDateTime()}] Mise en vente du token ${tokenId} annulée par ${seller}`);
        
        // Invalider les caches associés
        await this.invalidateMarketplaceListingsCache();
        await this.invalidateUserTokenCache(seller);
      });
      
      this.logger.log(`[2025-05-05 09:23:17] nesssim - Écouteurs d'événements blockchain configurés`);
    } catch (error) {
      this.logger.error(`[2025-05-05 09:23:17] nesssim - Erreur lors de la configuration des écouteurs d'événements: ${error.message}`);
    }
  }

  // Méthodes d'invalidation de cache
  private async invalidateMarketplaceListingsCache() {
    try {
      await this.cacheManager.del('marketplace_listings_enhanced');
      await this.cacheManager.del('marketplace_token_index');
      this.logger.log(`[${this.getCurrentDateTime()}] Cache des listings marketplace invalidé`);
    } catch (error) {
      this.logger.error(`[${this.getCurrentDateTime()}] Erreur lors de l'invalidation du cache des listings: ${error.message}`);
    }
  }

  private async invalidateUserTokenCache(address: string) {
    if (!address) return;
    
    try {
      const normalizedAddress = address.toLowerCase();
      await this.cacheManager.del(`user_tokens_${normalizedAddress}`);
      this.logger.log(`[${this.getCurrentDateTime()}] Cache des tokens pour l'utilisateur ${normalizedAddress} invalidé`);
    } catch (error) {
      this.logger.error(`[${this.getCurrentDateTime()}] Erreur lors de l'invalidation du cache utilisateur: ${error.message}`);
    }
  }

  private async invalidateUserTokenCaches(...addresses: string[]) {
    for (const address of addresses) {
      await this.invalidateUserTokenCache(address);
    }
  }

  private async invalidateTokenIdRangeCache() {
    try {
      await this.cacheManager.del('token_id_range');
      this.logger.log(`[${this.getCurrentDateTime()}] Cache de la plage de token IDs invalidé`);
    } catch (error) {
      this.logger.error(`[${this.getCurrentDateTime()}] Erreur lors de l'invalidation du cache de plage de tokens: ${error.message}`);
    }
  }

  private getCurrentDateTime(): string {
    const now = new Date();
    return now.toISOString().replace('T', ' ').substring(0, 19);
  }
}