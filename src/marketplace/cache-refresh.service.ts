import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager'; // Importation depuis @nestjs/cache-manager
import { Cache } from 'cache-manager';
import { BlockchainService } from 'src/blockchain/services/blockchain.service';
import { MarketplaceService } from './marketplace.service';

@Injectable()
export class CacheRefreshService {
  private readonly logger = new Logger(CacheRefreshService.name);

  constructor(
    private readonly blockchainService: BlockchainService,
    private readonly marketplaceService: MarketplaceService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache
  ) {}

  // Actualiser l'index des tokens toutes les 10 minutes
  @Cron(CronExpression.EVERY_10_MINUTES)
  async refreshTokenIndex() {
    this.logger.log(`[${this.getCurrentDateTime()}] nesssim - Actualisation programmée de l'index des tokens`);
    
    try {
      const tokenIndex = await this.blockchainService.buildTokenIndex();
      
      if (tokenIndex.length > 0) {
        await this.cacheManager.set('marketplace_token_index', tokenIndex, 600); // 10 minutes
        this.logger.log(`[${this.getCurrentDateTime()}] nesssim - Index des tokens actualisé avec ${tokenIndex.length} entrées`);
      } else {
        this.logger.warn(`[${this.getCurrentDateTime()}] nesssim - Index des tokens vide, cache non mis à jour`);
      }
    } catch (error) {
      this.logger.error(`[${this.getCurrentDateTime()}] nesssim - Erreur lors de l'actualisation de l'index des tokens: ${error.message}`);
    }
  }

  // Actualiser la plage des token IDs toutes les heures
  @Cron(CronExpression.EVERY_HOUR)
  async refreshTokenIdRange() {
    this.logger.log(`[${this.getCurrentDateTime()}] nesssim - Actualisation programmée de la plage de token IDs`);
    
    try {
      const tokenRange = await this.blockchainService.getTokenIdRange();
      await this.cacheManager.set('token_id_range', tokenRange, 3600); // 1 heure
      this.logger.log(`[${this.getCurrentDateTime()}] nesssim - Plage de token IDs actualisée: ${tokenRange.min} à ${tokenRange.max}`);
    } catch (error) {
      this.logger.error(`[${this.getCurrentDateTime()}] nesssim - Erreur lors de l'actualisation de la plage de token IDs: ${error.message}`);
    }
  }

  // Régénérer le cache des listings tous les jours à minuit
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async regenerateListingsCache() {
    this.logger.log(`[${this.getCurrentDateTime()}] nesssim - Régénération programmée du cache des listings`);
    
    try {
      // Invalider d'abord le cache existant
      await this.cacheManager.del('marketplace_listings_enhanced');
      
      // Appeler le service pour régénérer le cache
      const listings = await this.marketplaceService.getMarketplaceListings();
      this.logger.log(`[${this.getCurrentDateTime()}] nesssim - Cache des listings régénéré avec ${listings.count} entrées`);
    } catch (error) {
      this.logger.error(`[${this.getCurrentDateTime()}] nesssim - Erreur lors de la régénération du cache des listings: ${error.message}`);
    }
  }

  private getCurrentDateTime(): string {
    const now = new Date();
    return now.toISOString().replace('T', ' ').substring(0, 19);
  }
}