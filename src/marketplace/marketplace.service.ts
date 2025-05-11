import { Injectable, Logger, NotFoundException, BadRequestException, InternalServerErrorException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager'; // Importation depuis @nestjs/cache-manager
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BlockchainService } from 'src/blockchain/services/blockchain.service';
import { Land } from 'src/lands/schemas/land.schema';
import { ethers } from 'ethers';
import { Cache } from 'cache-manager';

@Injectable()
export class MarketplaceService {
    private readonly logger = new Logger(MarketplaceService.name);

    constructor(
        @InjectModel(Land.name) private landModel: Model<Land>,
        private readonly blockchainService: BlockchainService,
        @Inject(CACHE_MANAGER) private cacheManager: Cache
    ) { }


    /**
     * Récupère tous les tokens possédés par un utilisateur spécifique
     * @param ethAddress Adresse Ethereum de l'utilisateur
     * @returns Liste des tokens possédés par l'utilisateur
     */
    async getUserTokens(ethAddress: string) {
        try {
            if (!ethers.isAddress(ethAddress)) {
                throw new BadRequestException('Adresse Ethereum invalide');
            }

            const currentDateTime = this.getCurrentDateTime();
            const cacheKey = `user_tokens_${ethAddress.toLowerCase()}`;

            // 1. Vérifier si les données sont en cache
            const cachedTokens = await this.cacheManager.get<any[]>(cacheKey);
            if (cachedTokens && Array.isArray(cachedTokens)) {
                this.logger.log(`[${currentDateTime}] Récupération des tokens depuis le cache pour l'utilisateur: ${ethAddress}`);
                return {
                    success: true,
                    data: cachedTokens,
                    count: cachedTokens.length,
                    message: `Récupéré ${cachedTokens.length} tokens pour l'adresse ${ethAddress} (cache)`,
                    timestamp: currentDateTime,
                    fromCache: true
                };
            }

            this.logger.log(`[${currentDateTime}] Récupération des tokens pour l'utilisateur avec l'adresse: ${ethAddress}`);

            // 2. Obtenir les contrats
            const landToken = this.blockchainService.getLandToken();
            const marketplace = this.blockchainService.getMarketplace();

            // 3. Obtenir la plage de token IDs actifs (peut être mise en cache séparément)
            let tokenRange = { min: 1, max: 200 }; // Valeurs par défaut
            try {
                // Cette méthode devrait être implémentée dans BlockchainService
                const rangeFromCache = await this.cacheManager.get<{ min: number, max: number }>('token_id_range');
                if (rangeFromCache) {
                    tokenRange = rangeFromCache;
                }
            } catch (error) {
                this.logger.warn(`[${currentDateTime}] Impossible de récupérer la plage de tokens, utilisation des valeurs par défaut: ${error.message}`);
            }

            // 4. Traitement par lots
            const BATCH_SIZE = 20;
            const userTokens = [];

            // 5. Traiter les tokens par lots
            for (let batchStart = tokenRange.min; batchStart <= tokenRange.max; batchStart += BATCH_SIZE) {
                const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, tokenRange.max);
                const tokenBatch = Array.from({ length: batchEnd - batchStart + 1 }, (_, i) => batchStart + i);

                // 5.1 Traiter chaque token du lot en parallèle
                const batchResults = await Promise.all(
                    tokenBatch.map(async (tokenId) => {
                        try {
                            // Vérifier si le token existe et appartient à l'utilisateur
                            let ownerAddress;
                            try {
                                ownerAddress = await landToken.ownerOf(tokenId);
                                if (ownerAddress.toLowerCase() !== ethAddress.toLowerCase()) {
                                    return null; // Ne pas inclure ce token
                                }
                            } catch (e) {
                                return null; // Token n'existe pas
                            }

                            // Récupérer les détails du token et du listing en parallèle
                            const [tokenData, listing] = await Promise.all([
                                landToken.tokenData(tokenId),
                                marketplace.listings(tokenId)
                            ]);

                            const landId = Number(tokenData.landId);

                            // Récupérer les données du terrain de MongoDB
                            const land = await this.landModel.findOne({ blockchainLandId: landId.toString() }).exec();

                            return {
                                tokenId: tokenId,
                                landId: landId,
                                tokenNumber: Number(tokenData.tokenNumber),
                                purchasePrice: ethers.formatEther(tokenData.purchasePrice),
                                mintDate: new Date(Number(tokenData.mintDate) * 1000).toISOString(),
                                land: land ? {
                                    id: land._id.toString(),
                                    title: land.title || '',
                                    location: land.location || '',
                                    surface: land.surface || 0,
                                    imageUrl: land.imageCIDs && land.imageCIDs.length > 0 ?
                                        `https://ipfs.io/ipfs/${land.imageCIDs[0]}` : null
                                } : null,
                                isListed: listing.isActive,
                                listingPrice: listing.isActive ? ethers.formatEther(listing.price) : null
                            };
                        } catch (error) {
                            this.logger.debug(`[${currentDateTime}] Erreur lors du traitement du token ${tokenId}: ${error.message}`);
                            return null;
                        }
                    })
                );

                // Ajouter uniquement les résultats non nuls
                userTokens.push(...batchResults.filter(Boolean));
            }

            this.logger.log(`[${currentDateTime}] Trouvé ${userTokens.length} tokens pour l'adresse ${ethAddress}`);

            // 6. Mettre en cache pour les futures requêtes
            if (userTokens.length > 0) {
                await this.cacheManager.set(cacheKey, userTokens, 300); // Cache valide pour 5 minutes
            }

            return {
                success: true,
                data: userTokens,
                count: userTokens.length,
                message: `Récupéré ${userTokens.length} tokens pour l'adresse ${ethAddress}`,
                timestamp: currentDateTime
            };
        } catch (error) {
            this.logger.error(`Erreur lors de la récupération des tokens utilisateur: ${error.message}`, error.stack);
            throw new InternalServerErrorException(`Échec de la récupération des tokens: ${error.message}`);
        }
    }
    /**
   * Récupère tous les tokens mis en vente par un utilisateur spécifique
   * @param ethAddress Adresse Ethereum du vendeur
   * @returns Liste des tokens mis en vente par l'utilisateur
   */
    async getUserListedTokens(ethAddress: string) {
        try {
            if (!ethers.isAddress(ethAddress)) {
                throw new BadRequestException('Adresse Ethereum invalide');
            }

            const currentDateTime = this.getCurrentDateTime();
            this.logger.log(`[${currentDateTime}] Récupération des tokens mis en vente par l'utilisateur: ${ethAddress}`);

            // Récupérer les contrats
            const landToken = this.blockchainService.getLandToken();
            const marketplace = this.blockchainService.getMarketplace();

            // Définir un nombre maximum raisonnable de tokens à vérifier
            const MAX_TOKEN_ID = 200; // À ajuster selon votre cas d'utilisation

            const listedTokens = [];

            // Parcourir tous les tokens potentiels
            for (let tokenId = 1; tokenId <= MAX_TOKEN_ID; tokenId++) {
                try {
                    // Vérifier si le token existe
                    let exists = false;
                    try {
                        await landToken.ownerOf(tokenId);
                        exists = true;
                    } catch (e) {
                        // Le token n'existe pas, passer au suivant
                        continue;
                    }

                    if (!exists) continue;

                    // Vérifier si le token est listé et par l'utilisateur spécifié
                    const listing = await marketplace.listings(tokenId);

                    if (listing.isActive && listing.seller.toLowerCase() === ethAddress.toLowerCase()) {
                        // Récupérer les détails du token
                        const tokenData = await landToken.tokenData(tokenId);
                        const landId = Number(tokenData.landId);

                        // Récupérer les détails du terrain depuis MongoDB
                        const land = await this.landModel.findOne({ blockchainLandId: landId.toString() }).exec();

                        listedTokens.push({
                            tokenId: tokenId,
                            landId: landId,
                            price: ethers.formatEther(listing.price),
                            land: land ? {
                                id: land._id.toString(),
                                title: land.title || '',
                                location: land.location || '',
                                surface: land.surface || 0,
                                imageUrl: land.imageCIDs && land.imageCIDs.length > 0 ?
                                    `https://ipfs.io/ipfs/${land.imageCIDs[0]}` : null
                            } : null,
                            tokenData: {
                                tokenNumber: Number(tokenData.tokenNumber),
                                purchasePrice: ethers.formatEther(tokenData.purchasePrice),
                                mintDate: new Date(Number(tokenData.mintDate) * 1000).toISOString()
                            },
                            listedDate: currentDateTime // Approximatif, car le contrat ne stocke pas la date de mise en vente
                        });
                    }
                } catch (error) {
                    // Ignorer les erreurs individuelles et continuer
                    continue;
                }
            }

            this.logger.log(`[${currentDateTime}] Récupéré ${listedTokens.length} tokens mis en vente par l'utilisateur ${ethAddress}`);

            return {
                success: true,
                data: listedTokens,
                count: listedTokens.length,
                message: `Récupéré ${listedTokens.length} tokens mis en vente par l'utilisateur ${ethAddress}`,
                timestamp: currentDateTime
            };
        } catch (error) {
            this.logger.error(`Erreur lors de la récupération des tokens mis en vente: ${error.message}`, error.stack);
            throw new InternalServerErrorException(`Échec de la récupération des tokens mis en vente: ${error.message}`);
        }
    }

    /**
     * Liste un token à vendre sur la place de marché
     * @param tokenId ID du token à vendre
     * @param price Prix en ETH
     * @param seller Adresse Ethereum du vendeur
     * @returns Résultats de la transaction
     */
    async listToken(tokenId: number, price: string, seller: string) {
        try {
            if (!ethers.isAddress(seller)) {
                throw new BadRequestException('Adresse du vendeur invalide');
            }

            if (isNaN(tokenId) || tokenId <= 0) {
                throw new BadRequestException('ID du token invalide');
            }

            const priceValue = parseFloat(price);
            if (isNaN(priceValue) || priceValue <= 0) {
                throw new BadRequestException('Prix invalide');
            }

            const currentDateTime = this.getCurrentDateTime();
            this.logger.log(`[${currentDateTime}] Mise en vente du token ${tokenId} au prix de ${price} ETH par ${seller}`);

            // Récupérer les contrats
            const landToken = this.blockchainService.getLandToken();
            const marketplace = this.blockchainService.getMarketplace();

            // Vérifier que le token existe et appartient au vendeur
            try {
                const owner = await landToken.ownerOf(tokenId);
                if (owner.toLowerCase() !== seller.toLowerCase()) {
                    throw new BadRequestException('Le vendeur n\'est pas le propriétaire de ce token');
                }
            } catch (error) {
                throw new BadRequestException('Token invalide ou inexistant');
            }

            // Vérifier si le token a déjà été approuvé pour le marketplace
            const isApproved = await landToken.isApprovedForAll(seller, marketplace.target);

            if (!isApproved) {
                // Approuver le marketplace pour transférer le token
                const approveTx = await landToken.setApprovalForAll(marketplace.target, true);
                await approveTx.wait();
                this.logger.log(`[${currentDateTime}] Marketplace approuvé pour les transferts de tokens par ${seller}`);
            }

            // Lister le token sur la place de marché
            const priceInWei = ethers.parseEther(price);
            const tx = await marketplace.listToken(tokenId, priceInWei);
            const receipt = await tx.wait();

            return {
                success: true,
                data: {
                    transactionHash: receipt.hash,
                    blockNumber: receipt.blockNumber,
                    tokenId: tokenId,
                    price: price,
                    seller: seller,
                    timestamp: currentDateTime
                },
                message: `Token ${tokenId} mis en vente avec succès au prix de ${price} ETH`
            };
        } catch (error) {
            this.logger.error(`Erreur lors de la mise en vente du token: ${error.message}`, error.stack);
            throw new InternalServerErrorException(`Échec de la mise en vente du token: ${error.message}`);
        }
    }
    /**
     * Liste plusieurs tokens à vendre en une seule transaction
     * @param tokenIds Tableau des IDs des tokens à vendre
     * @param prices Tableau des prix correspondants en ETH
     * @param seller Adresse Ethereum du vendeur
     * @returns Résultats de la transaction
     */
    async listMultipleTokens(tokenIds: number[], prices: string[], seller: string) {
        try {
            if (!ethers.isAddress(seller)) {
                throw new BadRequestException('Adresse du vendeur invalide');
            }

            if (!tokenIds || !prices || tokenIds.length === 0 || prices.length === 0) {
                throw new BadRequestException('Tableaux de tokens ou de prix invalides');
            }

            if (tokenIds.length !== prices.length) {
                throw new BadRequestException('Les tableaux de tokens et de prix doivent avoir la même longueur');
            }
            this.logger.log(`Mise en vente de ${tokenIds.length} tokens par ${seller}`);

            // Vérifier que tous les tokens appartiennent au vendeur
            const landToken = this.blockchainService.getLandToken();
            for (let i = 0; i < tokenIds.length; i++) {
                try {
                    const owner = await landToken.ownerOf(tokenIds[i]);
                    if (owner.toLowerCase() !== seller.toLowerCase()) {
                        throw new BadRequestException(`Le token ${tokenIds[i]} n'appartient pas au vendeur`);
                    }
                } catch (error) {
                    throw new BadRequestException(`Le token ${tokenIds[i]} n'existe pas ou est invalide`);
                }
            }

            // Convertir les prix en wei
            const pricesInWei = prices.map(price => ethers.parseEther(price));

            // Approuver le marketplace si nécessaire
            const marketplace = this.blockchainService.getMarketplace();
            const isApproved = await landToken.isApprovedForAll(seller, marketplace.target);
            if (!isApproved) {
                const approveTx = await landToken.setApprovalForAll(marketplace.target, true);
                await approveTx.wait();
                this.logger.log(`Marketplace approuvé pour les transferts de tokens par ${seller}`);
            }

            // Lister les tokens
            const tx = await marketplace.listMultipleTokens(tokenIds, pricesInWei);
            const receipt = await tx.wait();

            // Préparer les détails des tokens listés
            const listedTokensDetails = [];
            for (let i = 0; i < tokenIds.length; i++) {
                try {
                    const tokenData = await landToken.tokenData(tokenIds[i]);
                    const landId = Number(tokenData.landId);

                    // Récupérer les informations du terrain depuis MongoDB si disponible
                    const land = await this.landModel.findOne({ blockchainLandId: landId.toString() }).exec();

                    listedTokensDetails.push({
                        tokenId: tokenIds[i],
                        landId: landId,
                        price: prices[i],
                        land: land ? {
                            id: land._id.toString(),
                            title: land.title || '',
                            location: land.location || '',
                            surface: land.surface || 0,
                            imageUrl: land.imageCIDs && land.imageCIDs.length > 0 ?
                                `https://ipfs.io/ipfs/${land.imageCIDs[0]}` : null
                        } : null
                    });
                } catch (error) {
                    // En cas d'erreur, inclure seulement les informations de base
                    listedTokensDetails.push({
                        tokenId: tokenIds[i],
                        price: prices[i]
                    });
                }
            }

            return {
                success: true,
                data: {
                    transactionHash: receipt.hash,
                    blockNumber: receipt.blockNumber,
                    tokens: listedTokensDetails,
                    seller: seller,
                    count: tokenIds.length,
                },
                message: `${tokenIds.length} tokens mis en vente avec succès`
            };
        } catch (error) {
            this.logger.error(`Erreur lors de la mise en vente multiple: ${error.message}`);
            throw new InternalServerErrorException(`Échec de la mise en vente multiple: ${error.message}`);
        }
    }

    /**
     * Transfère un token à un autre utilisateur
     * @param tokenId ID du token à transférer
     * @param from Adresse Ethereum expéditrice
     * @param to Adresse Ethereum destinataire
     * @returns Résultats de la transaction
     */
    async transferToken(tokenId: number, from: string, to: string) {
        try {
            if (!ethers.isAddress(from)) {
                throw new BadRequestException('Adresse de l\'expéditeur invalide');
            }

            if (!ethers.isAddress(to)) {
                throw new BadRequestException('Adresse du destinataire invalide');
            }

            if (isNaN(tokenId) || tokenId <= 0) {
                throw new BadRequestException('ID du token invalide');
            }

            const currentDateTime = this.getCurrentDateTime();
            this.logger.log(`[${currentDateTime}] Transfert du token ${tokenId} de ${from} à ${to}`);

            // Récupérer le contrat
            const landToken = this.blockchainService.getLandToken();

            // Vérifier que le token existe et appartient à l'expéditeur
            try {
                const owner = await landToken.ownerOf(tokenId);
                if (owner.toLowerCase() !== from.toLowerCase()) {
                    throw new BadRequestException('L\'expéditeur n\'est pas le propriétaire de ce token');
                }
            } catch (error) {
                throw new BadRequestException('Token invalide ou inexistant');
            }

            // Effectuer le transfert
            const tx = await landToken.transferToken(to, tokenId);
            const receipt = await tx.wait();

            // Obtenir les détails du token transféré
            const tokenData = await landToken.tokenData(tokenId);
            const landId = Number(tokenData.landId);

            return {
                success: true,
                data: {
                    transactionHash: receipt.hash,
                    blockNumber: receipt.blockNumber,
                    tokenId: tokenId,
                    landId: landId,
                    from: from,
                    to: to,
                    timestamp: currentDateTime
                },
                message: `Token ${tokenId} transféré avec succès de ${from} à ${to}`
            };
        } catch (error) {
            this.logger.error(`Erreur lors du transfert du token: ${error.message}`, error.stack);
            throw new InternalServerErrorException(`Échec du transfert du token: ${error.message}`);
        }
    }

    /**
     * Achète un token listé sur la place de marché
     * @param tokenId ID du token à acheter
     * @param buyer Adresse Ethereum de l'acheteur
     * @param value Montant en ETH à payer
     * @returns Résultats de la transaction
     */
    async buyToken(tokenId: number, buyer: string, value: string) {
        try {
            if (!ethers.isAddress(buyer)) {
                throw new BadRequestException('Adresse de l\'acheteur invalide');
            }

            if (isNaN(tokenId) || tokenId <= 0) {
                throw new BadRequestException('ID du token invalide');
            }

            const currentDateTime = this.getCurrentDateTime();
            this.logger.log(`[${currentDateTime}] Achat du token ${tokenId} pour ${value} ETH par ${buyer}`);

            // Récupérer les contrats
            const landToken = this.blockchainService.getLandToken();
            const marketplace = this.blockchainService.getMarketplace();

            // Vérifier que le token est bien listé sur la place de marché
            const listing = await marketplace.listings(tokenId);

            if (!listing.isActive) {
                throw new BadRequestException('Le token n\'est pas en vente');
            }

            // Valider le prix
            const listingPrice = ethers.formatEther(listing.price);
            const valueEth = parseFloat(value);

            if (valueEth < parseFloat(listingPrice)) {
                throw new BadRequestException(`Paiement insuffisant. Requis: ${listingPrice} ETH, Fourni: ${value} ETH`);
            }

            // Convertir en wei pour l'achat
            const valueInWei = ethers.parseEther(value);

            // Effectuer l'achat
            const tx = await marketplace.buyToken(tokenId, { value: valueInWei });
            const receipt = await tx.wait();

            // Obtenir les détails du token acheté
            const tokenData = await landToken.tokenData(tokenId);
            const landId = Number(tokenData.landId);

            return {
                success: true,
                data: {
                    transactionHash: receipt.hash,
                    blockNumber: receipt.blockNumber,
                    tokenId: tokenId,
                    landId: landId,
                    price: listingPrice,
                    buyer: buyer,
                    seller: listing.seller,
                    timestamp: currentDateTime
                },
                message: `Token ${tokenId} acheté avec succès pour ${listingPrice} ETH`
            };
        } catch (error) {
            this.logger.error(`Erreur lors de l'achat du token: ${error.message}`, error.stack);
            throw new InternalServerErrorException(`Échec de l'achat du token: ${error.message}`);
        }
    }

    /**
     * Annule la mise en vente d'un token
     * @param tokenId ID du token
     * @param seller Adresse Ethereum du vendeur
     * @returns Résultats de la transaction
     */
    async cancelListing(tokenId: number, seller: string) {
        try {
            if (!ethers.isAddress(seller)) {
                throw new BadRequestException('Adresse du vendeur invalide');
            }

            if (isNaN(tokenId) || tokenId <= 0) {
                throw new BadRequestException('ID du token invalide');
            }

            const currentDateTime = this.getCurrentDateTime();
            this.logger.log(`[${currentDateTime}] Annulation de la mise en vente du token ${tokenId} par ${seller}`);

            // Récupérer le contrat
            const marketplace = this.blockchainService.getMarketplace();

            // Vérifier que le token est bien listé sur la place de marché
            const listing = await marketplace.listings(tokenId);

            if (!listing.isActive) {
                throw new BadRequestException('Le token n\'est pas en vente');
            }

            if (listing.seller.toLowerCase() !== seller.toLowerCase()) {
                throw new BadRequestException('Seul le vendeur peut annuler la mise en vente');
            }

            // Annuler la mise en vente
            const tx = await marketplace.cancelListing(tokenId);
            const receipt = await tx.wait();

            return {
                success: true,
                data: {
                    transactionHash: receipt.hash,
                    blockNumber: receipt.blockNumber,
                    tokenId: tokenId,
                    seller: seller,
                    timestamp: currentDateTime
                },
                message: `Mise en vente du token ${tokenId} annulée avec succès`
            };
        } catch (error) {
            this.logger.error(`Erreur lors de l'annulation de la mise en vente: ${error.message}`, error.stack);
            throw new InternalServerErrorException(`Échec de l'annulation de la mise en vente: ${error.message}`);
        }
    }

    /**
    * Calculates the percentage change between purchase price and current price
    * @param purchasePrice Price at purchase (string in ETH)
    * @param currentPrice Current price (string in ETH)
    * @returns Object with percentage change details
    */
    private calculatePriceChange(purchasePrice: string, currentPrice: string) {
        // Assurer des valeurs valides
        const purchaseStr = (purchasePrice || "0").toString();
        const currentStr = (currentPrice || "0").toString();
        
        // Convertir en nombres
        const purchase = parseFloat(purchaseStr) || 0;
        const current = parseFloat(currentStr) || 0;
    
        // Éviter la division par zéro
        if (purchase === 0) return { percentage: 0, formatted: '0%', isPositive: false };
    
        const change = ((current - purchase) / purchase) * 100;
    
        return {
            percentage: isNaN(change) ? 0 : change,
            formatted: isNaN(change) ? '0%' : `${change.toFixed(2)}%`,
            isPositive: change >= 0
        };
    }

    /**
     * Calculates a simple investment potential score
     * @param price Current price
     * @param purchasePrice Purchase price
     * @param location Location (for potential bonus)
     * @param hoursListed Hours since listing
     * @returns Score from 1 to 10
     */
    private calculateInvestmentPotential(
        price: number | null | undefined,
        purchasePrice: number | null | undefined,
        location: string | null | undefined,
        hoursListed: number | null | undefined
    ): number {
        // Conversion en nombres valides
        const priceValue = price || 0;
        const purchasePriceValue = purchasePrice || 0;
        const locationStr = location || '';
        const hoursListedValue = hoursListed || 0;
        
        // Facteur basé sur la différence de prix
        let score = 5; // Score de base
    
        // Plus le prix est proche du prix d'achat, meilleur est l'investissement
        if (purchasePriceValue > 0) {
            const priceRatio = priceValue / purchasePriceValue;
            if (priceRatio < 1.1) score += 2; // Très bon prix
            else if (priceRatio < 1.3) score += 1; // Prix raisonnable
            else if (priceRatio > 2) score -= 2; // Prix trop élevé
        }
    
        // Bonus pour certains emplacements premium
        const premiumLocations = ['casablanca', 'rabat', 'marrakech', 'tanger'];
        if (locationStr && premiumLocations.some(loc => locationStr.toLowerCase().includes(loc))) {
            score += 1;
        }
    
        // Bonus pour les listings récents (moins de 48 heures)
        if (hoursListedValue < 48) score += 1;
    
        // S'assurer que le score reste entre 1 et 10
        return Math.max(1, Math.min(10, score));
    }

    /**
     * Converts numerical score to text rating
     * @param score Numerical score (1-10)
     * @returns Text rating
     */
    private getInvestmentRating(score: number | null | undefined): string {
        const scoreValue = score || 0;
        
        if (scoreValue >= 8) return 'Excellent';
        if (scoreValue >= 6) return 'Bon';
        if (scoreValue >= 4) return 'Moyen';
        if (scoreValue >= 2) return 'Faible';
        return 'Très faible';
    }

    /**
  * Récupère tous les tokens mis en vente avec dates et hash de transactions depuis les événements blockchain
  */
    async getMarketplaceListings() {
        try {
            const currentDateTime = this.getCurrentDateTime();
            this.logger.log(`[${currentDateTime}] Retrieving marketplace listings`);

            // Use the optimized blockchain service method
            const blockchainResponse = await this.blockchainService.getMarketplaceListings();
            const listings = blockchainResponse.data || [];

            if (listings.length === 0) {
                return {
                    success: true,
                    data: [],
                    count: 0,
                    message: 'No listings found on the marketplace',
                    timestamp: currentDateTime
                };
            }

            // Enhance listings with MongoDB data
            const enhancedListings = await Promise.all(listings.map(async (listing) => {
                try {
                    // Get land details from MongoDB
                    const land = await this.landModel.findOne({ blockchainLandId: listing.landId.toString() }).exec();

                    // Calculate investment potential
                    const listingDate = listing.listingTimestamp ? new Date(listing.listingTimestamp * 1000) : new Date();
                    const hoursListed = Math.floor((new Date().getTime() - listingDate.getTime()) / (1000 * 60 * 60));

                    // Extract purchase price from the right location
                    let purchasePrice = listing.purchasePrice;
                    if (!purchasePrice && listing.tokenData) {
                        purchasePrice = listing.tokenData.purchasePrice;
                    }

                    const investmentScore = this.calculateInvestmentPotential(
                        parseFloat(listing.price),
                        parseFloat(purchasePrice),
                        land?.location || listing.land?.location || '',
                        hoursListed
                    );

                    return {
                        ...listing,
                        listingDate: listingDate,
                        listingDateFormatted: listingDate.toLocaleDateString(),
                        daysSinceListing: Math.floor(hoursListed / 24),
                        land: land ? {
                            id: land._id.toString(),
                            title: land.title || '',
                            location: land.location || '',
                            surface: land.surface || 0,
                            imageUrl: land.imageCIDs && land.imageCIDs.length > 0 ?
                                `https://ipfs.io/ipfs/${land.imageCIDs[0]}` : null,
                            ...listing.land // Merge with blockchain land data
                        } : listing.land,
                        formattedPrice: `${listing.price} ETH`,
                        formattedPurchasePrice: `${purchasePrice} ETH`,
                        mintDateFormatted: new Date(listing.mintDate).toLocaleDateString(),
                        priceChangePercentage: this.calculatePriceChange(
                            purchasePrice,
                            listing.price
                        ),
                        investmentPotential: investmentScore,
                        investmentRating: this.getInvestmentRating(investmentScore)
                    };
                } catch (error) {
                    this.logger.error(`Error enhancing listing ${listing.tokenId}: ${error.message}`);
                    return listing;
                }
            }));

            return {
                success: true,
                data: enhancedListings,
                count: enhancedListings.length,
                message: `Retrieved ${enhancedListings.length} marketplace listings`,
                timestamp: currentDateTime
            };
        } catch (error) {
            this.logger.error(`Error retrieving marketplace listings: ${error.message}`);
            throw new InternalServerErrorException(`Failed to retrieve listings: ${error.message}`);
        }
    }

    /**
   * Récupère les statistiques du marketplace
   * @returns Statistiques générales du marketplace
   */
    async getMarketplaceStats() {
        try {
            const currentDateTime = this.getCurrentDateTime();
            this.logger.log(`[${currentDateTime}] Récupération des statistiques du marketplace`);

            // Récupérer tous les tokens listés
            const marketListingsResult = await this.getMarketplaceListings();
            const listedTokens = marketListingsResult.data;

            // Calculer le prix moyen
            let totalPrice = 0;
            listedTokens.forEach(token => {
                totalPrice += parseFloat(token.price);
            });
            const averagePrice = listedTokens.length > 0 ? totalPrice / listedTokens.length : 0;

            // Compter les vendeurs uniques
            const uniqueSellers = new Set();
            listedTokens.forEach(token => {
                uniqueSellers.add(token.seller.toLowerCase());
            });

            // Obtenir les frais du marketplace
            const marketplace = this.blockchainService.getMarketplace();
            const feePercentage = await marketplace.marketplaceFeePercentage();
            const formattedFeePercentage = (Number(feePercentage) / 100).toFixed(2);

            // Statistiques par terrain
            const landStats = {};
            listedTokens.forEach(token => {
                const landId = token.landId;
                if (!landStats[landId]) {
                    landStats[landId] = {
                        landId,
                        tokenCount: 0,
                        totalPrice: 0,
                        landInfo: token.land
                    };
                }

                landStats[landId].tokenCount++;
                landStats[landId].totalPrice += parseFloat(token.price);
            });

            // Convertir en tableau
            const landStatsArray = Object.values(landStats);

            return {
                success: true,
                data: {
                    totalListings: listedTokens.length,
                    uniqueSellers: uniqueSellers.size,
                    averagePrice: averagePrice.toFixed(6),
                    totalValue: totalPrice.toFixed(6),
                    marketplaceFee: `${formattedFeePercentage}%`,
                    landStats: landStatsArray,
                    recentActivity: listedTokens.slice(0, 5)
                },
                message: `Statistiques du marketplace récupérées avec succès`,
                timestamp: currentDateTime
            };
        } catch (error) {
            this.logger.error(`Erreur lors de la récupération des statistiques du marketplace: ${error.message}`, error.stack);
            throw new InternalServerErrorException(`Échec de la récupération des statistiques: ${error.message}`);
        }
    }

    /**
     * Fonction utilitaire pour obtenir la date et l'heure actuelles formatées
     * @returns Date et heure au format YYYY-MM-DD HH:MM:SS
     */
    private getCurrentDateTime(): string {
        const now = new Date();
        return now.toISOString().replace('T', ' ').substring(0, 19);
    }


    /**
   * Récupère tous les tokens possédés par un utilisateur avec les informations améliorées
   * en utilisant les méthodes optimisées de blockchain
   * @param ethAddress Adresse Ethereum de l'utilisateur
   * @returns Liste des tokens avec prix d'achat et prix de vente actuel
   */
    async getEnhancedUserTokens(ethAddress: string) {
        try {
            if (!ethers.isAddress(ethAddress)) {
                throw new BadRequestException('Adresse Ethereum invalide');
            }
    
            this.logger.log(`Récupération des tokens améliorés pour l'utilisateur: ${ethAddress}`);
    
            // 1. Récupérer les contrats
            const landRegistry = this.blockchainService.getLandRegistry();
    
            // 2. Utiliser les méthodes optimisées pour récupérer les tokens de l'utilisateur
            const userTokensResponse = await this.blockchainService.getUserTokens(ethAddress);
            const userOwnedTokens = userTokensResponse.data || [];
    
            // Nous allons essayer de récupérer les tokens listés, mais s'il y a une erreur, nous continuons quand même
            let userListedTokens = [];
            try {
                const userListedTokensResponse = await this.blockchainService.getUserListedTokens(ethAddress);
                userListedTokens = userListedTokensResponse.data || [];
            } catch (error) {
                this.logger.warn(`Erreur lors de la récupération des tokens listés, on continue avec les tokens possédés uniquement: ${error.message}`);
            }
    
            // Créer une map des tokens listés pour un accès rapide
            const listedTokensMap = new Map();
            userListedTokens.forEach(token => {
                if (token && token.tokenId) {
                    listedTokensMap.set(token.tokenId, token);
                }
            });
    
            this.logger.log(` Trouvé ${userOwnedTokens.length} tokens possédés et ${userListedTokens.length} tokens listés pour ${ethAddress}`);
    
            // Si aucun token n'est trouvé, retourner un résultat vide
            if (userOwnedTokens.length === 0 && userListedTokens.length === 0) {
                return {
                    success: true,
                    data: {
                        tokens: [],
                        stats: {
                            totalTokens: 0,
                            totalPurchaseValue: "0.000000",
                            totalCurrentMarketValue: "0.000000",
                            totalListedValue: "0.000000",
                            totalProfit: "0.000000",
                            totalProfitPercentage: "0.00",
                            countOwned: 0,
                            countListed: 0
                        }
                    },
                    count: 0,
                    message: `Aucun token trouvé pour l'adresse ${ethAddress}`,
                };
            }
    
            // 3. Collecter tous les tokens uniques (possédés + listés)
            const allTokens = [...userOwnedTokens.filter(token => token !== null)];
    
            // Ajouter les tokens listés qui ne sont pas déjà dans userOwnedTokens
            for (const listedToken of userListedTokens) {
                if (listedToken && listedToken.tokenId && 
                    !allTokens.some(token => token && token.tokenId === listedToken.tokenId)) {
                    allTokens.push(listedToken);
                }
            }
    
            // 4. Calculer les statistiques et enrichir les tokens
            let totalPurchaseValue = 0;
            let totalCurrentValue = 0;
            let totalListedValue = 0;
    
            const enhancedTokens = allTokens.map(token => {
                if (!token) return null;
    
                // Déterminer si le token est listé
                const isListed = token.tokenId && listedTokensMap.has(token.tokenId) || !!token.isListed;
    
                // Obtenir les prix (avec vérifications de null)
                const purchasePrice = token.purchasePrice || 
                    (token.tokenData && token.tokenData.purchasePrice ? token.tokenData.purchasePrice : "0");
    
                let currentMarketPrice = purchasePrice;
                if (token.land && token.land.pricePerToken) {
                    currentMarketPrice = token.land.pricePerToken;
                }
    
                const listingPrice = isListed ? 
                    (token.tokenId && listedTokensMap.has(token.tokenId) ? 
                        listedTokensMap.get(token.tokenId).price : token.listingPrice) || "0" : "0";
    
                // Assurer que tous les prix sont des chaînes valides
                const purchasePriceStr = typeof purchasePrice === 'string' ? purchasePrice : "0";
                const currentMarketPriceStr = typeof currentMarketPrice === 'string' ? currentMarketPrice : "0";
                const listingPriceStr = typeof listingPrice === 'string' ? listingPrice : "0";
    
                // Convertir en nombres pour les calculs
                const purchasePriceValue = parseFloat(purchasePriceStr) || 0;
                const currentMarketPriceValue = parseFloat(currentMarketPriceStr) || 0;
                const listingPriceValue = isListed ? (parseFloat(listingPriceStr) || 0) : 0;
    
                // Mettre à jour les totaux
                totalPurchaseValue += purchasePriceValue;
                totalCurrentValue += currentMarketPriceValue;
                if (listingPriceValue > 0) totalListedValue += listingPriceValue;
    
                // Calculer les variations de prix avec sécurité supplémentaire
                const marketPriceChange = this.calculatePriceChange(purchasePriceStr, currentMarketPriceStr);
                const listingPriceChange = isListed && listingPriceStr !== "0" ? 
                    this.calculatePriceChange(purchasePriceStr, listingPriceStr) : 
                    { percentage: 0, formatted: "0%", isPositive: false };
    
                // Calculer les heures depuis la mise en vente
                const listedToken = token.tokenId ? listedTokensMap.get(token.tokenId) : null;
                const listingTimestamp = listedToken && listedToken.listingTimestamp ? 
                    listedToken.listingTimestamp : 
                    (token.listingTimestamp || 0);
                    
                const hoursListed = listingTimestamp > 0 ? 
                    Math.floor((new Date().getTime() - new Date(listingTimestamp * 1000).getTime()) / (1000 * 60 * 60)) : 0;
    
                // Calculer le potentiel d'investissement 
                const location = token.land && token.land.location ? token.land.location : '';
                const investmentScore = isListed ? this.calculateInvestmentPotential(
                    listingPriceValue,
                    purchasePriceValue,
                    location,
                    hoursListed
                ) : null;
    
                // Déterminer l'owner status basé sur si le token est possédé ou listé
                // Assurer que seller existe avant de comparer
                const ownerStatus = (token.seller && token.seller === ethAddress) || 
                                   (token.owner === "you") ? "you" : "marketplace";
    
                // Assurer que toutes les dates sont valides
                const mintDate = token.mintDate || 
                    (token.tokenData && token.tokenData.mintDate ? token.tokenData.mintDate : new Date().toISOString());
                    
                const listingDate = listedToken && listedToken.listingDate ? 
                    listedToken.listingDate : 
                    (listingTimestamp > 0 ? new Date(listingTimestamp * 1000).toISOString() : new Date().toISOString());
    
                // Construire l'objet avec tous les champs nécessaires garantis non null
                return {
                    tokenId: token.tokenId || 0,
                    landId: token.landId || 0,
                    tokenNumber: token.tokenNumber || 
                        (token.tokenData ? token.tokenData.tokenNumber || 0 : 0),
                    owner: ownerStatus,
                    purchaseInfo: {
                        price: purchasePriceStr,
                        date: mintDate,
                        formattedPrice: `${purchasePriceStr} ETH`
                    },
                    currentMarketInfo: {
                        price: currentMarketPriceStr,
                        change: marketPriceChange.percentage,
                        changeFormatted: marketPriceChange.formatted,
                        isPositive: marketPriceChange.isPositive,
                        formattedPrice: `${currentMarketPriceStr} ETH`
                    },
                    listingInfo: isListed ? {
                        price: listingPriceStr,
                        seller: (listedToken && listedToken.seller) || token.seller || ethAddress,
                        change: listingPriceChange.percentage,
                        changeFormatted: listingPriceChange.formatted,
                        isPositive: listingPriceChange.isPositive,
                        formattedPrice: `${listingPriceStr} ETH`,
                        listingDate: listingDate
                    } : null,
                    isListed: isListed,
                    land: token.land || {
                        location: '',
                        surface: 0,
                        owner: '',
                        isRegistered: false,
                        status: 'UNKNOWN',
                        totalTokens: 0,
                        availableTokens: 0,
                        pricePerToken: '0'
                    },
                    investmentMetrics: isListed ? {
                        potential: investmentScore || 0,
                        rating: this.getInvestmentRating(investmentScore || 0)
                    } : null
                };
            }).filter(token => token !== null); // Filtrer les tokens null
    
            // 5. Trier les tokens: possédés d'abord, puis listés
            enhancedTokens.sort((a, b) => {
                if (a.owner === "you" && b.owner !== "you") return -1;
                if (a.owner !== "you" && b.owner === "you") return 1;
                if (a.landId !== b.landId) return a.landId - b.landId;
                return a.tokenId - b.tokenId;
            });
    
            // 6. Préparer les statistiques finales
            const stats = {
                totalTokens: enhancedTokens.length,
                totalPurchaseValue: totalPurchaseValue.toFixed(6),
                totalCurrentMarketValue: totalCurrentValue.toFixed(6),
                totalListedValue: totalListedValue.toFixed(6),
                totalProfit: (totalCurrentValue - totalPurchaseValue).toFixed(6),
                totalProfitPercentage: totalPurchaseValue > 0
                    ? (((totalCurrentValue - totalPurchaseValue) / totalPurchaseValue) * 100).toFixed(2)
                    : "0.00",
                countOwned: enhancedTokens.filter(t => t.owner === "you").length,
                countListed: enhancedTokens.filter(t => t.isListed).length
            };
    
            return {
                success: true,
                data: {
                    tokens: enhancedTokens,
                    stats: stats
                },
                count: enhancedTokens.length,
                message: `Récupéré ${enhancedTokens.length} tokens améliorés pour l'adresse ${ethAddress}`,
            };
        } catch (error) {
            this.logger.error(` Erreur lors de la récupération des tokens améliorés: ${error.message}`, error.stack);
            
            // En cas d'erreur, retourner un résultat avec un tableau vide mais une structure complète
            // pour éviter les erreurs de null dans le frontend
            return {
                success: false,
                data: {
                    tokens: [],
                    stats: {
                        totalTokens: 0,
                        totalPurchaseValue: "0.000000",
                        totalCurrentMarketValue: "0.000000",
                        totalListedValue: "0.000000",
                        totalProfit: "0.000000",
                        totalProfitPercentage: "0.00",
                        countOwned: 0,
                        countListed: 0
                    }
                },
                count: 0,
                message: `Erreur lors de la récupération des tokens améliorés: ${error.message}`,
            };
        }
    }
}

