import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers, Contract } from 'ethers';
import { BlockchainService } from './blockchain.service';

@Injectable()
export class RelayerService {
    private readonly logger = new Logger(RelayerService.name);
    private relayerWallet: ethers.Wallet;

    constructor(
        private readonly configService: ConfigService,
        private readonly blockchainService: BlockchainService
    ) {
        this.initializeRelayer();
    }

    private initializeRelayer() {
        try {
            const relayerPrivateKey = this.configService.get<string>('PRIVATE_KEY');
            if (!relayerPrivateKey) {
                throw new Error('RELAYER_PRIVATE_KEY not configured');
            }

            this.relayerWallet = new ethers.Wallet(
                relayerPrivateKey,
                this.blockchainService.getProvider()
            );

            this.logger.log(`Relayer initialized with address: ${this.relayerWallet.address}`);
        } catch (error) {
            this.logger.error('Failed to initialize relayer:', error);
            throw error;
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
    
            this.logger.log(`Relaying validation for land ID: ${blockchainId}`, {
                validator: validatorAddress,
                isValid
            });
    
            // Vérification du solde du relayer
            const provider = this.blockchainService.getProvider();
            const balance = await provider.getBalance(this.relayerWallet.address);
            const minimumBalance = ethers.parseEther('0.1');
    
            if (balance < minimumBalance) {
                this.logger.error(`Relayer balance too low: ${ethers.formatEther(balance)} ETH`);
                throw new Error('Relayer balance too low');
            }
    
            // Vérifications des paramètres
            if (!cidComments || cidComments.trim() === '') {
                throw new Error('CID comments cannot be empty');
            }
    
            if (!ethers.isAddress(validatorAddress)) {
                throw new Error('Invalid validator address');
            }
    
            // Récupération et connexion du contrat
            const landRegistry = this.blockchainService.getLandRegistry();
            const connectedContract = landRegistry.connect(this.relayerWallet) as Contract;
    
            // Vérification que le terrain existe
            try {
                const landDetails = await connectedContract.getAllLandDetails(blockchainId);
                if (!landDetails[3]) { // isRegistered est à l'index 3
                    throw new Error(`Land ID ${blockchainId} exists but is not registered`);
                }
            } catch (error) {
                throw new Error(`Land ID ${blockchainId} does not exist or is invalid: ${error.message}`);
            }
    
            // Préparation et envoi de la transaction
            const tx = await connectedContract.validateLand(
                blockchainId,
                cidComments,
                isValid,
                validatorAddress,
                { gasLimit: 300000 }
            );
    
            this.logger.log('Validation transaction sent:', tx.hash);
    
            // Attente de la confirmation
            const receipt = await tx.wait();
    
            // Vérification de l'événement
            const validationAddedEvent = receipt.logs.find(log => {
                try {
                    const parsedLog = connectedContract.interface.parseLog({
                        topics: log.topics,
                        data: log.data
                    });
                    return parsedLog?.name === 'ValidationAdded';
                } catch {
                    return false;
                }
            });
    
            if (!validationAddedEvent) {
                this.logger.warn('ValidationAdded event not found in transaction receipt');
            }
    
            // Retourner le résultat
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
            this.logger.error('Error in relayed validation:', {
                error: error.message,
                landId,
                validator: validatorAddress
            });
    
            if (error.message.includes('UnauthorizedValidator')) {
                throw new Error(`Validator ${validatorAddress} is not authorized`);
            }
            if (error.message.includes('ValidatorAlreadyValidated')) {
                throw new Error(`Validator ${validatorAddress} has already validated this land`);
            }
    
            throw new Error(`Validation relayée échouée: ${error.message}`);
        }
    }

    async checkRelayerBalance(): Promise<string> {
        const provider = this.blockchainService.getProvider();
        const balance = await provider.getBalance(this.relayerWallet.address);
        const balanceInEth = ethers.formatEther(balance);
        this.logger.log(`Current relayer balance: ${balanceInEth} ETH`);
        return balanceInEth;
    }

    getRelayerAddress(): string {
        return this.relayerWallet.address;
    }

    // Méthode utilitaire pour vérifier si une adresse est un validateur
    async isValidator(address: string): Promise<boolean> {
        try {
            const landRegistry = this.blockchainService.getLandRegistry();
            return await landRegistry.validators(address);
        } catch (error) {
            this.logger.error('Error checking validator status:', error);
            return false;
        }
    }
}