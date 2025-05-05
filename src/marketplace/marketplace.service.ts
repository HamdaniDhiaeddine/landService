import { Injectable, Logger, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BlockchainService } from 'src/blockchain/services/blockchain.service';
import { Land } from 'src/lands/schemas/land.schema';
import { ethers } from 'ethers';

@Injectable()
export class MarketplaceService {
    private readonly logger = new Logger(MarketplaceService.name);

    constructor(
        @InjectModel(Land.name) private landModel: Model<Land>,
        private readonly blockchainService: BlockchainService,
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
            this.logger.log(`[${currentDateTime}] Récupération des tokens pour l'utilisateur avec l'adresse: ${ethAddress}`);

            // Get the contracts
            const landToken = this.blockchainService.getLandToken();
            const marketplace = this.blockchainService.getMarketplace();

            // Define a reasonable maximum token ID to check
            const MAX_TOKEN_ID = 200; // Adjust as needed
            const userTokens = [];

            this.logger.log(`[${currentDateTime}] Vérification des tokens de 1 à ${MAX_TOKEN_ID}`);

            // Check each token ID
            for (let tokenId = 1; tokenId <= MAX_TOKEN_ID; tokenId++) {
                try {
                    // Skip to next iteration if token doesn't exist
                    let exists = false;
                    try {
                        const ownerAddress = await landToken.ownerOf(tokenId);
                        exists = true;
                    } catch (e) {
                        // Token doesn't exist, skip to next iteration
                        continue;
                    }

                    // Check if the token belongs to the user
                    const owner = await landToken.ownerOf(tokenId);
                    if (owner.toLowerCase() !== ethAddress.toLowerCase()) {
                        continue;
                    }

                    // Token belongs to user, get its details
                    const tokenData = await landToken.tokenData(tokenId);
                    const landId = Number(tokenData.landId);

                    // Check if it's listed on marketplace
                    const listing = await marketplace.listings(tokenId);

                    // Find corresponding land in database
                    const land = await this.landModel.findOne({ blockchainLandId: landId.toString() }).exec();

                    userTokens.push({
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
                    });
                } catch (error) {
                    // Skip errors for individual tokens
                    continue;
                }
            }

            this.logger.log(`[${currentDateTime}] Trouvé ${userTokens.length} tokens pour l'adresse ${ethAddress}`);

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

    async getBlockchainWalletAddress(): Promise<string> {
        // This should call your blockchain service to get the wallet address
        return this.blockchainService.getWalletAddress();
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

            const currentDateTime = "2025-05-04 00:33:31"; // Date et heure actuelles
            this.logger.log(`[${currentDateTime}] nesssim - Mise en vente de ${tokenIds.length} tokens par ${seller}`);

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
                this.logger.log(`[${currentDateTime}] nesssim - Marketplace approuvé pour les transferts de tokens par ${seller}`);
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
                    timestamp: currentDateTime
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
     * Récupère tous les tokens listés sur la place de marché
     * @returns Liste des tokens en vente
     */
    async getMarketListings() {
        try {
            const currentDateTime = this.getCurrentDateTime();
            this.logger.log(`[${currentDateTime}] Récupération de toutes les annonces du marketplace`);

            // Récupérer les contrats
            const landToken = this.blockchainService.getLandToken();
            const marketplace = this.blockchainService.getMarketplace();

            // Définir un nombre maximum raisonnable de tokens à vérifier
            const MAX_TOKEN_ID = 200; // À ajuster selon votre cas d'utilisation

            const listings = [];

            // Parcourir tous les tokens potentiels
            for (let tokenId = 1; tokenId <= MAX_TOKEN_ID; tokenId++) {
                try {
                    // Vérifier d'abord si le token existe
                    let exists = false;
                    try {
                        await landToken.ownerOf(tokenId);
                        exists = true;
                    } catch (e) {
                        // Le token n'existe pas, passer au suivant
                        continue;
                    }

                    if (!exists) continue;

                    // Vérifier si le token est listé
                    const listing = await marketplace.listings(tokenId);

                    if (listing.isActive) {
                        // Récupérer les détails du token
                        const tokenData = await landToken.tokenData(tokenId);
                        const landId = Number(tokenData.landId);

                        // Récupérer les détails du terrain depuis MongoDB
                        const land = await this.landModel.findOne({ blockchainLandId: landId.toString() }).exec();

                        listings.push({
                            tokenId: tokenId,
                            landId: landId,
                            price: ethers.formatEther(listing.price),
                            seller: listing.seller,
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
                            }
                        });
                    }
                } catch (error) {
                    // Ignorer les erreurs individuelles et continuer
                    continue;
                }
            }

            this.logger.log(`[${currentDateTime}] Récupéré ${listings.length} annonces actives`);

            return {
                success: true,
                data: listings,
                count: listings.length,
                message: `Récupéré ${listings.length} annonces actives du marketplace`,
                timestamp: currentDateTime
            };
        } catch (error) {
            this.logger.error(`Erreur lors de la récupération des annonces du marketplace: ${error.message}`, error.stack);
            throw new InternalServerErrorException(`Échec de la récupération des annonces: ${error.message}`);
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
            const marketListingsResult = await this.getMarketListings();
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
 /**
 * Récupère tous les tokens possédés par un utilisateur avec les informations améliorées
 * @param ethAddressOrKey Adresse Ethereum de l'utilisateur ou clé privée
 * @returns Liste des tokens avec prix d'achat et prix de vente actuel
 */
async getEnhancedUserTokens(ethAddressOrKey: string) {
    try {
        // Vérifier et éventuellement convertir l'adresse
        let ethAddress: string;
        
        if (ethAddressOrKey.startsWith('0x') && ethAddressOrKey.length === 42) {
            // C'est déjà une adresse Ethereum
            ethAddress = ethAddressOrKey;
        } else {
            try {
                // Essayer de dériver l'adresse à partir d'une clé privée
                const wallet = new ethers.Wallet(ethAddressOrKey);
                ethAddress = await wallet.getAddress();
                this.logger.log(`Adresse dérivée à partir de la clé privée: ${ethAddress}`);
            } catch (error) {
                // Si ce n'est pas une clé privée valide, obtenir l'adresse du service blockchain
                try {
                    ethAddress = await this.blockchainService.getWalletAddress();
                    this.logger.log(`Utilisation de l'adresse du portefeuille du service blockchain: ${ethAddress}`);
                } catch (fallbackError) {
                    this.logger.error(`Échec de récupération de l'adresse du portefeuille: ${fallbackError.message}`);
                    throw new BadRequestException('Adresse Ethereum invalide');
                }
            }
        }
        
        // Maintenant on vérifie que l'adresse est valide
        if (!ethers.isAddress(ethAddress)) {
            throw new BadRequestException('Adresse Ethereum invalide');
        }

        const currentDateTime = "2025-05-04 00:38:21"; // Utilisation des valeurs fournies
        this.logger.log(`[${currentDateTime}] nesssim - Récupération des tokens améliorés pour l'utilisateur: ${ethAddress}`);

        // Récupérer les contrats
        const landToken = this.blockchainService.getLandToken();
        const marketplace = this.blockchainService.getMarketplace();
        const landRegistry = this.blockchainService.getLandRegistry();

        // Définir un nombre maximum raisonnable de tokens à vérifier
        const MAX_TOKEN_ID = 200; // À ajuster selon votre cas d'utilisation

        const userTokens = [];
        let totalPurchaseValue = 0;
        let totalCurrentValue = 0;
        let totalListedValue = 0;

        // Parcourir tous les tokens potentiels
        for (let tokenId = 1; tokenId <= MAX_TOKEN_ID; tokenId++) {
            try {
                // Vérifier si le token existe
                let owner;
                try {
                    owner = await landToken.ownerOf(tokenId);
                } catch (e) {
                    // Le token n'existe pas, passer au suivant
                    continue;
                }

                // Vérifier si le token appartient à l'utilisateur
                if (owner.toLowerCase() !== ethAddress.toLowerCase()) {
                    // Ce n'est pas le propriétaire, mais vérifions si ce token est listé par notre utilisateur
                    const listing = await marketplace.listings(tokenId);
                    if (listing.isActive && listing.seller.toLowerCase() === ethAddress.toLowerCase()) {
                        // Ce token est listé par notre utilisateur mais détenu par le marketplace
                        owner = listing.seller;
                    } else {
                        // Ni propriétaire ni vendeur, passer au suivant
                        continue;
                    }
                }

                // Continuer avec votre code existant...
                // Le token appartient à l'utilisateur ou est listé par lui, récupérer les détails
                const tokenData = await landToken.tokenData(tokenId);
                const landId = Number(tokenData.landId);

                // Récupérer les détails du terrain
                let landDetails;
                try {
                    landDetails = await landRegistry.getAllLandDetails(landId);
                } catch (error) {
                    this.logger.warn(`[${currentDateTime}] Erreur lors de la récupération des détails du terrain ${landId}: ${error.message}`);
                }

                // Récupérer les informations du terrain depuis MongoDB
                const land = await this.landModel.findOne({ blockchainLandId: landId.toString() }).exec();

                // Vérifier si le token est listé
                const listing = await marketplace.listings(tokenId);
                const isListed = listing.isActive;

                // Calculer les valeurs
                const purchasePrice = ethers.formatEther(tokenData.purchasePrice);
                const currentMarketPrice = landDetails ? ethers.formatEther(landDetails[8]) : purchasePrice; // pricePerToken ou prix d'achat par défaut
                const listingPrice = isListed ? ethers.formatEther(listing.price) : null;

                // Calculer les variations
                const purchasePriceValue = parseFloat(purchasePrice);
                const currentMarketPriceValue = parseFloat(currentMarketPrice);
                const listingPriceValue = listingPrice ? parseFloat(listingPrice) : null;

                // Variations en pourcentage
                let marketPriceChange = null;
                if (purchasePriceValue > 0 && currentMarketPriceValue > 0) {
                    marketPriceChange = ((currentMarketPriceValue - purchasePriceValue) / purchasePriceValue) * 100;
                }

                let listingPriceChange = null;
                if (purchasePriceValue > 0 && listingPriceValue) {
                    listingPriceChange = ((listingPriceValue - purchasePriceValue) / purchasePriceValue) * 100;
                }

                // Mise à jour des totaux
                totalPurchaseValue += purchasePriceValue;
                totalCurrentValue += currentMarketPriceValue;
                if (listingPriceValue) totalListedValue += listingPriceValue;

                // Ajouter le token avec les informations améliorées
                userTokens.push({
                    tokenId: tokenId,
                    landId: landId,
                    tokenNumber: Number(tokenData.tokenNumber),
                    owner: owner.toLowerCase() === ethAddress.toLowerCase() ? "you" : "marketplace",
                    purchaseInfo: {
                        price: purchasePrice,
                        date: new Date(Number(tokenData.mintDate) * 1000).toISOString(),
                        formattedPrice: `${purchasePrice} ETH`
                    },
                    currentMarketInfo: {
                        price: currentMarketPrice,
                        change: marketPriceChange,
                        changeFormatted: marketPriceChange !== null ? `${marketPriceChange.toFixed(2)}%` : "N/A",
                        formattedPrice: `${currentMarketPrice} ETH`
                    },
                    listingInfo: isListed ? {
                        price: listingPrice,
                        seller: listing.seller,
                        change: listingPriceChange,
                        changeFormatted: listingPriceChange !== null ? `${listingPriceChange.toFixed(2)}%` : "N/A",
                        formattedPrice: `${listingPrice} ETH`
                    } : null,
                    isListed: isListed,
                    land: land ? {
                        id: land._id.toString(),
                        title: land.title || '',
                        location: land.location || '',
                        surface: land.surface || 0,
                        imageUrl: land.imageCIDs && land.imageCIDs.length > 0 ?
                            `https://ipfs.io/ipfs/${land.imageCIDs[0]}` : null
                    } : landDetails ? {
                        location: landDetails[0],
                        surface: Number(landDetails[1]),
                        owner: landDetails[2]
                    } : null
                });
            } catch (error) {
                // Ignorer les erreurs individuelles et continuer
                this.logger.debug(`[${currentDateTime}] Erreur lors du traitement du token ${tokenId}: ${error.message}`);
                continue;
            }
        }

        this.logger.log(`[${currentDateTime}] Récupéré ${userTokens.length} tokens améliorés pour ${ethAddress}`);

        // Le reste de votre code reste inchangé
        // Trier les tokens: d'abord les tokens possédés, puis les tokens listés
        userTokens.sort((a, b) => {
            // D'abord par propriété (possédés avant listés)
            if (a.owner === "you" && b.owner !== "you") return -1;
            if (a.owner !== "you" && b.owner === "you") return 1;

            // Ensuite par terrain
            if (a.landId !== b.landId) return a.landId - b.landId;

            // Enfin par tokenId
            return a.tokenId - b.tokenId;
        });

        // Statistiques globales
        const stats = {
            totalTokens: userTokens.length,
            totalPurchaseValue: totalPurchaseValue.toFixed(6),
            totalCurrentMarketValue: totalCurrentValue.toFixed(6),
            totalListedValue: totalListedValue.toFixed(6),
            totalProfit: (totalCurrentValue - totalPurchaseValue).toFixed(6),
            totalProfitPercentage: totalPurchaseValue > 0
                ? (((totalCurrentValue - totalPurchaseValue) / totalPurchaseValue) * 100).toFixed(2)
                : "0.00",
            countOwned: userTokens.filter(t => t.owner === "you").length,
            countListed: userTokens.filter(t => t.isListed).length
        };

        return {
            success: true,
            data: {
                tokens: userTokens,
                stats: stats
            },
            count: userTokens.length,
            message: `Récupéré ${userTokens.length} tokens améliorés pour l'adresse ${ethAddress}`,
            timestamp: currentDateTime
        };
    } catch (error) {
        this.logger.error(`Erreur lors de la récupération des tokens améliorés: ${error.message}`, error.stack);
        throw new InternalServerErrorException(`Échec de la récupération des tokens améliorés: ${error.message}`);
    }
}
    /**
     * Récupère la date de mise en vente d'un token et le hash de transaction depuis les événements blockchain
     * @param tokenId ID du token
     * @returns Objet contenant la date de listing et le hash de transaction, ou null si non trouvés
     */
    private async getTokenListingDetails(tokenId: number): Promise<{ date: Date, txHash: string } | null> {
        try {
            this.logger.log(`Récupération des détails de listing pour le token ${tokenId}`);

            const provider = this.blockchainService.getProvider();
            const marketplace = this.blockchainService.getMarketplace();

            // Créer une interface pour l'événement TokenListed
            const eventInterface = new ethers.Interface([
                "event TokenListed(uint256 indexed tokenId, uint256 price, address indexed seller)"
            ]);

            // Construire un filtre pour l'événement
            const filter = {
                address: marketplace.target,
                topics: [
                    // Hash de l'événement TokenListed
                    ethers.id("TokenListed(uint256,uint256,address)"),
                    // Encodage du tokenId pour le filtrage
                    ethers.toBeHex(tokenId, 32)
                ]
            };

            // Obtenir le bloc actuel
            const currentBlock = await provider.getBlockNumber();
            this.logger.log(`Bloc actuel: ${currentBlock}`);

            // Chercher dans les 10000 derniers blocs (ajuster selon vos besoins)
            const fromBlock = Math.max(0, currentBlock - 10000);
            this.logger.log(`Recherche d'événements du bloc ${fromBlock} au bloc ${currentBlock}`);

            // Récupérer les logs correspondants
            const logs = await provider.getLogs({
                ...filter,
                fromBlock,
                toBlock: currentBlock
            });

            this.logger.log(`Trouvé ${logs.length} événements de listing pour le token ${tokenId}`);

            if (logs.length === 0) {
                return null;
            }

            // Trouver l'événement le plus récent qui correspond à un listing actif
            const sortedLogs = [...logs].sort((a, b) => b.blockNumber - a.blockNumber);
            const latestLog = sortedLogs[0];

            // Obtenir le bloc pour déterminer la date
            const block = await provider.getBlock(latestLog.blockNumber);

            if (!block || !block.timestamp) {
                this.logger.warn(`Impossible de récupérer le timestamp du bloc ${latestLog.blockNumber}`);
                return null;
            }

            // Récupérer le hash de transaction du log
            const txHash = latestLog.transactionHash;
            const listingDate = new Date(Number(block.timestamp) * 1000);

            this.logger.log(`Date de listing du token ${tokenId}: ${listingDate.toISOString()}, txHash: ${txHash}`);

            return {
                date: listingDate,
                txHash: txHash
            };
        } catch (error) {
            this.logger.error(`Erreur lors de la récupération des détails de listing du token ${tokenId}: ${error.message}`);
            return null;
        }
    }
    /**
  * Récupère tous les tokens mis en vente avec dates et hash de transactions depuis les événements blockchain
  */
    async getMarketplaceListings() {
        try {
            const currentDateTime = "2025-05-04 17:26:23";
            this.logger.log(`[${currentDateTime}] nesssim - Récupération des listings du marketplace`);

            // Récupérer les listings depuis la blockchain
            const blockchainResponse = await this.blockchainService.getMarketplaceListings();
            const blockchainListings = blockchainResponse.data || [];

            this.logger.log(`[${currentDateTime}] nesssim - Trouvé ${blockchainListings.length} tokens en vente sur la blockchain`);

            // Enrichir les listings avec les données des événements blockchain
            const enhancedListings = await Promise.all(blockchainListings.map(async (listing) => {
                try {
                    // Récupérer la date de listing et le hash de transaction depuis les événements blockchain
                    const listingDetails = await this.getTokenListingDetails(listing.tokenId);

                    // Extraire les données nécessaires de la structure reçue
                    let purchasePrice;

                    // Si le prix d'achat est directement dans listing
                    if (listing.purchasePrice) {
                        purchasePrice = listing.purchasePrice;
                    }
                    // Si le prix est dans un objet tokenData
                    else if (listing.tokenData && listing.tokenData.purchasePrice) {
                        purchasePrice = listing.tokenData.purchasePrice;
                    }
                    // Valeur par défaut
                    else {
                        purchasePrice = "0";
                    }

                    const mintDate = listing.mintDate || (listing.tokenData ? listing.tokenData.mintDate : null) || new Date().toISOString();
                    const price = listing.price || "0";

                    // Récupérer les données de localisation
                    const location = listing.land?.location || '';

                    // Calculer les heures depuis la mise en vente
                    const hoursListed = listingDetails?.date ?
                        Math.floor((new Date().getTime() - listingDetails.date.getTime()) / (1000 * 60 * 60)) :
                        0;

                    // AJOUT: Calculer le score de potentiel d'investissement
                    const investmentScore = calculateInvestmentPotential(
                        parseFloat(price),
                        parseFloat(purchasePrice),
                        location,
                        hoursListed
                    );

                    this.logger.debug(`[${currentDateTime}] nesssim - Token ${listing.tokenId}: Score d'investissement calculé = ${investmentScore}`);

                    // Construire l'objet enrichi basé sur la structure existante
                    return {
                        // Conserver les données originales
                        ...listing,

                        // Ajouter les informations de date de listing et transaction
                        listingDate: listingDetails?.date,
                        listingDateFormatted: listingDetails?.date ? listingDetails.date.toLocaleDateString() : 'Non disponible',
                        listingTimestamp: listingDetails?.date ? listingDetails.date.getTime() : 0,
                        daysSinceListing: listingDetails?.date ? Math.floor((new Date().getTime() - listingDetails.date.getTime()) / (1000 * 60 * 60 * 24)) : null,
                        listingTxHash: listingDetails?.txHash || null,
                        etherscanUrl: listingDetails?.txHash ? `https://sepolia.etherscan.io/tx/${listingDetails.txHash}` : null,

                        // Formats lisibles pour l'affichage
                        formattedPrice: `${price} ETH`,
                        formattedPurchasePrice: `${purchasePrice} ETH`,
                        mintDateFormatted: new Date(mintDate).toLocaleDateString(),

                        // Calculer la différence de prix
                        priceChangePercentage: calculatePriceChange(purchasePrice, price),

                        // Ajouter des indicateurs pour l'UI
                        isRecentlyListed: listingDetails?.date ? Math.floor((new Date().getTime() - listingDetails.date.getTime()) / (1000 * 60 * 60 * 24)) < 7 : false,
                        isHighlyProfitable: parseFloat(price) > parseFloat(purchasePrice) * 1.5,

                        // AJOUT: Ajouter le score d'investissement
                        investmentPotential: investmentScore,
                        investmentRating: getInvestmentRating(investmentScore)
                    };
                } catch (error) {
                    this.logger.error(`[${currentDateTime}] nesssim - Erreur lors de l'enrichissement du listing ${listing.tokenId}: ${error.message}`);
                    return listing; // Retourner le listing original en cas d'erreur
                }
            }));

            // Trier par date de listing si disponible
            try {
                enhancedListings.sort((a, b) => {
                    if (!a.listingTimestamp && !b.listingTimestamp) return 0;
                    if (!a.listingTimestamp) return 1;
                    if (!b.listingTimestamp) return -1;
                    return b.listingTimestamp - a.listingTimestamp;
                });
            } catch (sortError) {
                this.logger.warn(`[${currentDateTime}] nesssim - Erreur lors du tri: ${sortError.message}`);
            }

            return {
                success: true,
                data: enhancedListings,
                count: enhancedListings.length,
                message: `Récupéré ${enhancedListings.length} tokens en vente sur le marketplace`,
                timestamp: currentDateTime
            };
        } catch (error) {
            const currentDateTime = "2025-05-04 17:26:23";
            this.logger.error(`[${currentDateTime}] nesssim - Erreur lors de la récupération des listings: ${error.message}`);
            throw new InternalServerErrorException(`Échec de la récupération des listings: ${error.message}`);
        }
    }
}
/**
 * Calcule le pourcentage de changement entre le prix d'achat et le prix de vente
 * @param purchasePrice Prix d'achat (string en ETH)
 * @param currentPrice Prix actuel (string en ETH)
 * @returns Objet contenant le pourcentage et une version formatée
 */
function calculatePriceChange(purchasePrice: string, currentPrice: string) {
    const purchase = parseFloat(purchasePrice);
    const current = parseFloat(currentPrice);

    if (purchase === 0) return { percentage: 0, formatted: '0%', isPositive: false };

    const change = ((current - purchase) / purchase) * 100;

    return {
        percentage: change,
        formatted: `${change.toFixed(2)}%`,
        isPositive: change >= 0
    };
}

/**
 * Calcule un score simple de potentiel d'investissement
 * @param price Prix actuel
 * @param purchasePrice Prix d'achat
 * @param location Emplacement (pour bonus potentiel)
 * @param hoursListed Heures depuis la mise en vente
 * @returns Score de 1 à 10
 */
function calculateInvestmentPotential(
    price: number,
    purchasePrice: number,
    location: string,
    hoursListed: number
): number {
    // Facteur basé sur la différence de prix
    let score = 5; // Score de base

    // Plus le prix est proche du prix d'achat, meilleur est l'investissement
    if (purchasePrice > 0) {
        const priceRatio = price / purchasePrice;
        if (priceRatio < 1.1) score += 2; // Très bon prix
        else if (priceRatio < 1.3) score += 1; // Prix raisonnable
        else if (priceRatio > 2) score -= 2; // Prix trop élevé
    }

    // Bonus pour certains emplacements premium
    const premiumLocations = ['casablanca', 'rabat', 'marrakech', 'tanger'];
    if (location && premiumLocations.some(loc => location.toLowerCase().includes(loc))) {
        score += 1;
    }

    // Bonus pour les listings récents (moins de 48 heures)
    if (hoursListed < 48) score += 1;

    // S'assurer que le score reste entre 1 et 10
    return Math.max(1, Math.min(10, score));
}

/**
 * Convertit un score numérique en notation textuelle pour l'affichage
 * @param score Score numérique (1-10)
 * @returns Évaluation textuelle
 */
function getInvestmentRating(score: number): string {
    if (score >= 8) return 'Excellent';
    if (score >= 6) return 'Bon';
    if (score >= 4) return 'Moyen';
    if (score >= 2) return 'Faible';
    return 'Très faible';
}