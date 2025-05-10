import { Controller, Get, Post, Body, Param, UseGuards, Req, BadRequestException, InternalServerErrorException, Logger, Query } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { MarketplaceService } from './marketplace.service';
import { JWTPayload } from 'src/auth/interfaces/jwt-payload.interface';

@Controller('marketplace')
@UseGuards(JwtAuthGuard)
export class MarketplaceController {
    private readonly logger = new Logger(MarketplaceController.name);
   

    constructor(
        private readonly marketplaceService: MarketplaceService
    ) { }

    @Get('my-tokens')
    async getMyTokens(@Req() req: Request) {
        try {
            const user = (req as any).user as JWTPayload;
            this.logger.log(` Demande de récupération des tokens personnels`);

            if (!user.ethAddress) {
                throw new BadRequestException('Adresse Ethereum non trouvée dans le profil utilisateur');
            }

            return this.marketplaceService.getUserTokens(user.ethAddress);
        } catch (error) {
            this.logger.error(`Erreur lors de la récupération des tokens: ${error.message}`);
            throw error;
        }
    }

    @Get('user-tokens/:address')
    async getUserTokens(@Param('address') address: string) {
        try {
            this.logger.log(` Demande de récupération des tokens pour l'adresse ${address}`);
            return this.marketplaceService.getUserTokens(address);
        } catch (error) {
            this.logger.error(`Erreur lors de la récupération des tokens pour l'adresse ${address}: ${error.message}`);
            throw error;
        }
    }

    @Post('list')
    async listToken(
        @Body('tokenId') tokenId: number,
        @Body('price') price: string,
        @Req() req: Request
    ) {
        try {
            const user = (req as any).user as JWTPayload;
            this.logger.log(`Demande de mise en vente du token ${tokenId} au prix de ${price} ETH`);

            if (!user.ethAddress) {
                throw new BadRequestException('Adresse Ethereum non trouvée dans le profil utilisateur');
            }

            return this.marketplaceService.listToken(tokenId, price, user.ethAddress);
        } catch (error) {
            this.logger.error(`Erreur lors de la mise en vente du token: ${error.message}`);
            throw error;
        }
    }

    @Get('my-listed-tokens')
    async getMyListedTokens(@Req() req: Request) {
        try {
            const user = (req as any).user as JWTPayload;
            this.logger.log(` Demande de récupération des tokens mis en vente personnels`);

            if (!user.ethAddress) {
                throw new BadRequestException('Adresse Ethereum non trouvée dans le profil utilisateur');
            }

            return this.marketplaceService.getUserListedTokens(user.ethAddress);
        } catch (error) {
            this.logger.error(` Erreur lors de la récupération des tokens mis en vente: ${error.message}`);
            throw error;
        }
    }

    @Get('listed-tokens/:address')
    async getUserListedTokens(@Param('address') address: string) {
        try {
            this.logger.log(`Demande de récupération des tokens mis en vente par ${address}`);
            return this.marketplaceService.getUserListedTokens(address);
        } catch (error) {
            this.logger.error(` Erreur lors de la récupération des tokens mis en vente pour ${address}: ${error.message}`);
            throw error;
        }
    }

    @Post('transfer')
    async transferToken(
        @Body('tokenId') tokenId: number,
        @Body('to') to: string,
        @Req() req: Request
    ) {
        try {
            const user = (req as any).user as JWTPayload;
            this.logger.log(` Demande de transfert du token ${tokenId} vers ${to}`);

            if (!user.ethAddress) {
                throw new BadRequestException('Adresse Ethereum non trouvée dans le profil utilisateur');
            }

            return this.marketplaceService.transferToken(tokenId, user.ethAddress, to);
        } catch (error) {
            this.logger.error(` Erreur lors du transfert du token: ${error.message}`);
            throw error;
        }
    }

    @Post('buy')
    async buyToken(
        @Body('tokenId') tokenId: number,
        @Body('value') value: string,
        @Req() req: Request
    ) {
        try {
            const user = (req as any).user as JWTPayload;
            this.logger.log(`Demande d'achat du token ${tokenId} pour ${value} ETH`);

            if (!user.ethAddress) {
                throw new BadRequestException('Adresse Ethereum non trouvée dans le profil utilisateur');
            }

            return this.marketplaceService.buyToken(tokenId, user.ethAddress, value);
        } catch (error) {
            this.logger.error(` Erreur lors de l'achat du token: ${error.message}`);
            throw error;
        }
    }

    @Post('cancel-listing')
    async cancelListing(
        @Body('tokenId') tokenId: number,
        @Req() req: Request
    ) {
        try {
            const user = (req as any).user as JWTPayload;
            this.logger.log(` Demande d'annulation de la mise en vente du token ${tokenId}`);

            if (!user.ethAddress) {
                throw new BadRequestException('Adresse Ethereum non trouvée dans le profil utilisateur');
            }

            return this.marketplaceService.cancelListing(tokenId, user.ethAddress);
        } catch (error) {
            this.logger.error(`Erreur lors de l'annulation de la mise en vente: ${error.message}`);
            throw error;
        }
    }



    /**
     * Obtient la date et l'heure actuelles au format YYYY-MM-DD HH:MM:SS
     */
    private getCurrentDateTime(): string {
        const now = new Date();
        return now.toISOString().replace('T', ' ').substring(0, 19);
    }

    @Get('stats')
    async getMarketplaceStats() {
        try {
            this.logger.log(`Demande de récupération des statistiques du marketplace`);
            return this.marketplaceService.getMarketplaceStats();
        } catch (error) {
            this.logger.error(`Erreur lors de la récupération des statistiques: ${error.message}`);
            throw error;
        }
    }

    @Post('list-multiple')
    async listMultipleTokens(
        @Body('tokenIds') tokenIds: number[],
        @Body('prices') prices: string[],
        @Req() req: Request
    ) {
        try {
            const user = (req as any).user as JWTPayload;
            this.logger.log(`Demande de mise en vente de ${tokenIds?.length || 0} tokens`);

            if (!user.ethAddress) {
                throw new BadRequestException('Adresse Ethereum non trouvée dans le profil utilisateur');
            }

            return this.marketplaceService.listMultipleTokens(tokenIds, prices, user.ethAddress);
        } catch (error) {
            this.logger.error(`Erreur lors de la mise en vente multiple: ${error.message}`);
            throw error;
        }
    }



    @Get('enhanced-tokens')
    async getEnhancedUserTokens(@Req() req: Request) {
        const user = (req as any).user as JWTPayload;

        try {

            this.logger.log(` Demande de récupération des tokens améliorés pour ${user.ethAddress}`);
            return this.marketplaceService.getEnhancedUserTokens(user.ethAddress);
        } catch (error) {
            this.logger.error(`Erreur lors de la récupération des tokens améliorés pour ${user.ethAddress}: ${error.message}`);
            throw error;
        }
    }

    /**
      * Récupère tous les tokens disponibles à la vente sur le marketplace
      * @returns Liste des tokens en vente avec leurs détails
      */
    @Get('listings')
    async getMarketplaceListings() {
        try {
            this.logger.log(`Récupération des listings du marketplace`);
            return this.marketplaceService.getMarketplaceListings();
        } catch (error) {
            this.logger.error(`Erreur lors de la récupération des listings: ${error.message}`);
            throw error;
        }
    }

    /**
     * Récupère les listings filtrés selon différents critères
     */
    @Get('listings/filtered')
    async getFilteredListings(
        @Query('minPrice') minPrice?: string,
        @Query('maxPrice') maxPrice?: string,
        @Query('landType') landType?: string,
        @Query('sortBy') sortBy?: string,
        @Query('sortOrder') sortOrder?: string
    ) {
        try {
            this.logger.log(`Récupération des listings filtrés`);

            // Utiliser le service existant - l'implémentation du filtrage peut être ajoutée ultérieurement
            const result = await this.marketplaceService.getMarketplaceListings();

            // Filtrage des résultats
            let filteredListings = [...result.data];

            // Filtrer par prix minimum
            if (minPrice) {
                const min = parseFloat(minPrice);
                filteredListings = filteredListings.filter(item => parseFloat(item.price) >= min);
            }

            // Filtrer par prix maximum
            if (maxPrice) {
                const max = parseFloat(maxPrice);
                filteredListings = filteredListings.filter(item => parseFloat(item.price) <= max);
            }

            // Filtrer par type de terrain
            if (landType) {
                filteredListings = filteredListings.filter(item =>
                    item.landDetails?.landType?.toLowerCase() === landType.toLowerCase()
                );
            }

            // Tri des résultats
            if (sortBy) {
                const order = sortOrder?.toLowerCase() === 'desc' ? -1 : 1;

                filteredListings.sort((a, b) => {
                    switch (sortBy.toLowerCase()) {
                        case 'price':
                            return (parseFloat(a.price) - parseFloat(b.price)) * order;
                        case 'date':
                            return ((a.listingTimestamp || 0) - (b.listingTimestamp || 0)) * order;
                        case 'profit':
                            return (a.priceChangePercentage.percentage - b.priceChangePercentage.percentage) * order;
                        default:
                            return 0;
                    }
                });
            }

            return {
                success: true,
                data: filteredListings,
                count: filteredListings.length,
                message: `Récupéré ${filteredListings.length} tokens filtrés sur le marketplace`,
            };
        } catch (error) {
            this.logger.error(`Erreur lors de la récupération des listings filtrés: ${error.message}`);
            throw error;
        }
    }
}

