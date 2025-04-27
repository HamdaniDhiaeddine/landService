import { Injectable, Logger, InternalServerErrorException, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Land } from './schemas/land.schema';
import { CreateLandDto, FileBufferDto } from './dto/create-land.dto';
import { UpdateLandDto } from './dto/update-land.dto';
import { IpfsService } from 'src/ipfs/ipfs.service';
import { EncryptionService } from 'src/encryption/encryption.service';
import * as fs from 'fs/promises';
import { BlockchainService } from 'src/blockchain/services/blockchain.service';
import { ethers } from 'ethers';
import { RelayerService } from 'src/blockchain/services/relayer.service';
import { ObjectId } from 'mongodb';
import { LandValidationStatus, ValidationDocument, ValidationEntry, ValidationMetadata, ValidationProgress, ValidationRequest, ValidationResponse, ValidatorType } from 'src/blockchain/interfaces/validation.interface';
import { JWTPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { Validation } from './schemas/validation.schema';
import { ValidateLandDto } from './dto/validate-land.dto';
import { EnhancedLandResult, IpfsFileInfo } from './interfaces/enhanced-land.interface';


@Injectable()
export class LandService {
  private readonly logger = new Logger(LandService.name);

  constructor(
    @InjectModel(Land.name) private landModel: Model<Land>,
    @InjectModel(Validation.name) private validationModel: Model<ValidationDocument>,
    private readonly ipfsService: IpfsService,
    private readonly blockchainService: BlockchainService,
    private readonly encryptionService: EncryptionService,
  ) { }

  async create(createLandDto: CreateLandDto, ownerAddress: string): Promise<Land> {
    try {
      // Valider l'adresse Ethereum
      if (!ethers.isAddress(ownerAddress)) {
        throw new Error('Invalid Ethereum address');
      }

      this.logger.log(`Starting land creation process at ${new Date().toISOString()} for user: nesssim`);
      this.logger.log(`Files to process: ${createLandDto.fileBuffers?.documents?.length || 0} documents, ${createLandDto.fileBuffers?.images?.length || 0} images`);

      // Ajouter des logs pour vérifier les buffers
      if (createLandDto.fileBuffers?.documents?.length > 0) {
        createLandDto.fileBuffers.documents.forEach((doc, i) => {
          this.logger.debug(`Document buffer ${i}: ${doc.originalname}, buffer size: ${doc.buffer?.length || 0} bytes`);
        });
      }

      if (createLandDto.fileBuffers?.images?.length > 0) {
        createLandDto.fileBuffers.images.forEach((img, i) => {
          this.logger.debug(`Image buffer ${i}: ${img.originalname}, buffer size: ${img.buffer?.length || 0} bytes`);
        });
      }

      // 1. Traiter les documents directement à partir des buffers
      const documentsCIDs = await this.processBuffers(
        createLandDto.fileBuffers?.documents || [],
        'documents'
      );

      // 2. Traiter les images directement à partir des buffers
      const imagesCIDs = await this.processBuffers(
        createLandDto.fileBuffers?.images || [],
        'images'
      );

      // Créer un objet qui contient uniquement les CIDs
      const cidsData = {
        documentsCIDs: documentsCIDs,
        imagesCIDs: imagesCIDs,
      };

      // Générer un CID combiné
      const combinedCID = await this.ipfsService.uploadFile(
        Buffer.from(JSON.stringify(cidsData))
      );

      this.logger.log(`Generated combined CID for documents and images: ${combinedCID}`);

      // Convertir les commodités en Map pour Mongoose
      const amenitiesMap = new Map<string, boolean>();
      if (createLandDto.amenities) {
        Object.entries(createLandDto.amenities).forEach(([key, value]) => {
          amenitiesMap.set(key, Boolean(value));
        });
      }

      // 5. Enregistrer sur la blockchain avec des valeurs par défaut non nulles
      const blockchainTx = await this.blockchainService.registerLand({
        title: createLandDto.title,
        location: createLandDto.location,
        surface: Number(createLandDto.surface) || 1250,
        totalTokens: 100,
        pricePerToken: '1',
        owner: ownerAddress,
        metadataCID: combinedCID
      });

      // 6. Créer l'entrée dans MongoDB
      const land = new this.landModel({
        ...createLandDto,
        blockchainTxHash: blockchainTx.hash,
        blockchainLandId: blockchainTx.landId,
        ownerAddress,
        amenities: amenitiesMap,
        ipfsCIDs: documentsCIDs,
        imageCIDs: imagesCIDs,
      });

      const savedLand = await land.save();
      this.logger.log(`Land created with ID: ${savedLand._id}`, {
        landId: savedLand._id,
        blockchainTxHash: blockchainTx.hash,
        ownerAddress
      });

      return savedLand;
    } catch (error) {
      this.logger.error(`Error in create land:`, error);

      // Vérification spécifique pour l'erreur de conversion BigInt
      if (error.message && error.message.includes('Cannot convert null to a BigInt')) {
        throw new InternalServerErrorException(
          'Failed to create land: Cannot convert null to a BigInt. Please ensure totalTokens and pricePerToken are not null.'
        );
      }

      throw new InternalServerErrorException(
        `Failed to create land: ${error.message}`
      );
    }
  }


  // Méthode améliorée pour traiter les buffers directement
  private async processBuffers(files: FileBufferDto[], fileType: string): Promise<string[]> {
    if (!files || files.length === 0) {
      this.logger.log(`No ${fileType} files to process`);
      return [];
    }

    this.logger.log(`Processing ${files.length} ${fileType} files`);

    const results: string[] = [];

    for (const file of files) {
      try {
        if (!file.buffer || file.buffer.length === 0) {
          this.logger.warn(`Skipping ${fileType} file ${file.originalname}: Buffer non disponible ou vide`);
          continue;
        }

        this.logger.log(`Processing ${fileType} file: ${file.originalname}, size: ${file.buffer.length} bytes`);

        // Vérifier si le buffer est valide pour le debug
        if (Buffer.isBuffer(file.buffer)) {
          this.logger.debug(`Valid Buffer detected with length: ${file.buffer.length}`);
        } else {
          this.logger.warn(`Invalid Buffer type: ${typeof file.buffer}`);
          // Tentative de conversion si ce n'est pas un Buffer
          file.buffer = Buffer.from(file.buffer);
        }

        // Uploader vers IPFS directement à partir du buffer
        const cid = await this.ipfsService.uploadFile(file.buffer);
        this.logger.log(`File uploaded to IPFS: ${file.originalname} -> ${cid}`);

        results.push(cid);
      } catch (error) {
        this.logger.error(`Error processing ${fileType} file ${file.originalname}:`, error);
        // Continuer avec les autres fichiers même en cas d'erreur
      }
    }

    this.logger.log(`Successfully processed ${results.length} of ${files.length} ${fileType} files`);
    return results;
  }

  async processFiles(filePaths: string[]): Promise<string[]> {
    if (!filePaths || filePaths.length === 0) {
      console.log('Aucun fichier à traiter');
      return [];
    }

    const results = [];
    for (const path of filePaths) {
      try {
        // Vérifier si le chemin est valide
        if (!path) {
          console.log('Chemin de fichier non valide, ignoré');
          continue;
        }

        console.log(`Traitement du fichier: ${path}`);

        // Lire le fichier
        const fileContent = await fs.readFile(path);

        // Uploader vers IPFS
        const cid = await this.ipfsService.uploadFile(fileContent);
        console.log(`Fichier téléchargé vers IPFS avec CID: ${cid}`);

        results.push(cid);
      } catch (error) {
        console.error(`Error processing file ${path}:`, error);
        // Continuer avec les autres fichiers même en cas d'erreur
      }
    }

    return results;
  }
  async getDecryptedFile(cid: string): Promise<Buffer> {
    try {
      const encryptedBuffer = await this.ipfsService.getFile(cid);
      return this.encryptionService.decryptBuffer(encryptedBuffer);
    } catch (error) {
      this.logger.error(`Error retrieving file with CID ${cid}:`, error.stack);
      throw new InternalServerErrorException('Failed to retrieve and decrypt file');
    }
  }

  async findAll(): Promise<Land[]> {
    return this.landModel.find().exec();
  }


  async update(id: string, updateLandDto: UpdateLandDto): Promise<Land> {
    const updatedLand = await this.landModel
      .findByIdAndUpdate(id, updateLandDto, { new: true })
      .exec();
    if (!updatedLand) throw new NotFoundException(`Land with ID ${id} not found`);
    return updatedLand;
  }

  async remove(id: string): Promise<void> {
    const result = await this.landModel.findByIdAndDelete(id).exec();
    if (!result) throw new NotFoundException(`Land with ID ${id} not found`);
  }

  async updateValidationStatus(
    id: string,
    validationData: {
      status: string;
      validatedBy: string;
      validationTxHash: string;
      validationTimestamp: Date;
    }
  ) {
    return this.landModel.findByIdAndUpdate(
      id,
      {
        $set: {
          validationStatus: validationData.status,
          validatedBy: validationData.validatedBy,
          validationTxHash: validationData.validationTxHash,
          validationTimestamp: validationData.validationTimestamp
        }
      },
      { new: true }
    );
  }


  async findValidationsByLandId(landId: number): Promise<Validation[]> {
    return this.validationModel.find({ landId }).exec();
  }
  async getAllLandsFromBlockchain() {
    try {
      const lands = await this.blockchainService.getAllLands();
      return lands;
    } catch (error) {
      throw new Error(`Failed to fetch lands from blockchain: ${error.message}`);
    }
  }

  async validateLand(request: ValidationRequest, user: JWTPayload): Promise<ValidationResponse> {
    try {
      this.logger.log(`Starting validation process for land ID: ${request.landId} by user: ${user.userId}`);
  
      const blockchainLandId = request.landId;
      if (!blockchainLandId) {
        throw new BadRequestException('Blockchain Land ID is required');
      }
  
      // Vérifier que le rôle de l'utilisateur est un type de validateur valide
      if (!(user.role in ValidatorType)) {
        throw new BadRequestException(`Invalid validator role: ${user.role}`);
      }
  
      const land = await this.landModel.findOne({ blockchainLandId: blockchainLandId });
      if (!land) {
        throw new BadRequestException(`Land with blockchain ID ${blockchainLandId} not found`);
      }
  
      this.logger.log(`Land with blockchain ID ${blockchainLandId} found`);
  
      // Récupération de l'adresse Ethereum de l'utilisateur depuis le JWT
      const validatorAddress = user.ethAddress;
      if (!validatorAddress) {
        throw new BadRequestException('Validator Ethereum address not found in JWT');
      }
  
      // Timestamp pour la signature
      const timestamp = Math.floor(Date.now() / 1000);
  
      // Message à signer (sans mentionner le relayer)
      const messageToSign = `Validation officielle de terrain
          ID du terrain: ${blockchainLandId}
          Validateur: ${validatorAddress}
          Rôle: ${user.role}
          Horodatage: ${timestamp}
          Validation: ${request.isValid ? 'Approuvé' : 'Rejeté'}`;
  
      // Utiliser la clé privée du relayer existante
      const relayerPrivateKey = process.env.PRIVATE_KEY;
      if (!relayerPrivateKey) {
        throw new InternalServerErrorException('System signature key not configured');
      }
  
      // Créer le wallet pour la signature
      const signingWallet = new ethers.Wallet(relayerPrivateKey);
  
      // Signer le message
      const signature = await signingWallet.signMessage(messageToSign);
  
      this.logger.log('Official signature generated for validation', {
        validatorAddress,
        role: user.role,
        timestamp,
      });
  
      // Créer les métadonnées de validation avec le rôle directement comme ValidatorType
      const validationMetadata: ValidationMetadata = {
        text: request.comment,
        validator: user.ethAddress,
        validatorRole: user.role,
        validatorEmail: user.email,
        userId: user.userId,
        landId: blockchainLandId,
        timestamp: timestamp,
        isValid: request.isValid,
        validationType: this.getValidatorTypeEnum(user.role),
        signature: signature,
        signatureType: 'ECDSA',
        signatureStandard: 'ISO/IEC 14888-3',
        signedMessage: messageToSign
      };
  
      this.logger.log('Creating validation metadata', {
        blockchainLandId,
        validator: user.ethAddress,
        validatorRole: user.role,
      });
  
      // Upload des commentaires sur IPFS
      const cidComments = await this.ipfsService.uploadComment(
        JSON.stringify(validationMetadata)
      );
  
      this.logger.log('Successfully uploaded comments to IPFS', { cidComments });
  
      // Valider via le relayer
      const validationResult = await this.blockchainService.validateLandWithRelayer({
        landId: blockchainLandId,
        validatorAddress: user.ethAddress,
        cidComments,
        isValid: request.isValid
      });
  
      // Récupérer le txHash de la transaction blockchain
      const txHash = validationResult.validationDetails.txHash;
  
      // Création du document selon le schema Mongoose, en suivant ValidationDocument
      const validationDoc = {
        landId: land._id.toString(),
        blockchainLandId: blockchainLandId,
        validator: user.ethAddress,
        validatorType: this.getValidatorTypeEnum(user.role),
        timestamp: validationMetadata.timestamp,
        cidComments: cidComments,
        isValidated: request.isValid,
        txHash: txHash,
        blockNumber: validationResult.validationDetails.blockNumber,
        signature: signature,
        signatureType: 'ECDSA', 
        signedMessage: messageToSign
      };
  
      const savedValidation = await this.validationModel.create(validationDoc);
  
      // Enrichir ValidationEntry avec txHash et signature
      const validationEntry: ValidationEntry = {
        validator: user.ethAddress,
        validatorType: this.getValidatorTypeEnum(user.role),
        timestamp: validationMetadata.timestamp,
        isValidated: request.isValid,
        cidComments: cidComments,
        txHash: txHash,            
        signature: signature,        
        signatureType: 'ECDSA',      
        signedMessage: messageToSign 
      };
  
      // Mettre à jour le document land avec la nouvelle validation enrichie
      const updateResult = await this.landModel.findOneAndUpdate(
        { blockchainLandId: blockchainLandId },
        {
          $push: {
            validations: validationEntry // Utiliser ValidationEntry enrichie
          }
        },
        { new: true }
      );
  
      this.logger.log('Land document updated with validation', {
        landId: land._id,
        validationsCount: updateResult.validations ? updateResult.validations.length : 0,
        txHash: txHash // Log du txHash
      });
  
      // Calculer la progression de la validation
      const validationProgress = await this.calculateValidationProgressFromLand(updateResult);
  
      const newStatus = this.determineLandStatus(validationProgress);
      await this.landModel.findOneAndUpdate(
        { blockchainLandId: blockchainLandId },
        { $set: { status: newStatus } },
        { new: true }
      );
  
      // Construction de la réponse avec tous les attributs enrichis
      const response: ValidationResponse = {
        success: true,
        message: 'Validation processed successfully',
        data: {
          transaction: {
            hash: txHash, 
            blockNumber: validationResult.validationDetails.blockNumber,
            timestamp: validationMetadata.timestamp
          },
          validation: savedValidation,
          land: {
            id: land._id.toString(),
            blockchainId: blockchainLandId,
            status: this.determineLandStatus(validationProgress),
            location: land.location,
            lastValidation: {
              validator: user.ethAddress,
              validatorRole: user.role,
              isValid: request.isValid,
              timestamp: validationMetadata.timestamp,
              cidComments: cidComments,
              //txHash: txHash,              
              signature: signature         
            },
            validationProgress
          },
          signature: {
            value: signature,
            type: 'ECDSA',
            standard: 'ISO/IEC 14888-3',
            timestamp: timestamp
          }
        }
      };
  
      this.logger.log('Validation completed successfully', {
        blockchainLandId: blockchainLandId,
        validator: user.ethAddress,
        role: user.role,
        txHash: txHash,
      });
  
      return response;
    } catch (error) {
      this.logger.error('Validation failed', {
        error,
      });
      throw new InternalServerErrorException(`Validation failed: ${error.message}`);
    }
  }
  private async calculateValidationProgressFromLand(land: any): Promise<ValidationProgress> {
    this.logger.log('Calculating validation progress from land document', {
      landId: land._id,
      validationsCount: land.validations ? land.validations.length : 0
    });

    const progress: ValidationProgress = {
      total: 3,
      completed: 0,
      percentage: 0,
      validations: [
        {
          role: 'NOTAIRE',
          validated: false
        },
        {
          role: 'GEOMETRE',
          validated: false
        },
        {
          role: 'EXPERT_JURIDIQUE',
          validated: false
        }
      ]
    };

    if (land.validations && land.validations.length > 0) {
      land.validations.forEach(validation => {
        let validatorRole;
        // Gérer le cas où validatorType est un nombre ou un objet
        if (typeof validation.validatorType === 'number') {
          validatorRole = this.getValidatorRoleString(validation.validatorType);
        } else if (validation.validatorType) {
          validatorRole = this.getValidatorRoleString(parseInt(validation.validatorType));
        }

        const validationEntry = progress.validations.find(v => v.role === validatorRole);

        if (validationEntry && validation.isValidated) {
          validationEntry.validated = true;
          validationEntry.timestamp = validation.timestamp;
          validationEntry.validator = validation.validator;
          progress.completed++;
        }
      });

      progress.percentage = (progress.completed / progress.total) * 100;
    }

    this.logger.log('Validation progress calculated from land', {
      completed: progress.completed,
      percentage: progress.percentage
    });

    return progress;
  }
  private getValidatorTypeEnum(role: string): ValidatorType {
    const roleMap = {
      'NOTAIRE': ValidatorType.NOTAIRE,
      'GEOMETRE': ValidatorType.GEOMETRE,
      'EXPERT_JURIDIQUE': ValidatorType.EXPERT_JURIDIQUE
    };

    const validatorType = roleMap[role];
    if (validatorType === undefined) {
      throw new Error(`Invalid validator role: ${role}`);
    }

    return validatorType;
  }

  async findOne(id: string): Promise<Land> {
    const land = await this.landModel.findById(id).exec();
    if (!land) throw new NotFoundException(`Land with ID ${id} not found`);
    return land;
  }

  async createValidation(validationData: {
    landId: string;
    blockchainLandId: string;
    validator: string;
    cidComments: string;
    isValid: boolean;
    txHash: string;
    blockNumber: number;
    timestamp: Date;
  }): Promise<Validation> {
    const validation = new this.validationModel(validationData);
    try {
      return await validation.save();
    } catch (error) {
      this.logger.error('Error creating validation:', error.stack);
      throw new InternalServerErrorException('Failed to create validation');
    }
  }


  private getValidatorRoleString(type: ValidatorType): string {
    switch (type) {
      case ValidatorType.NOTAIRE:
        return 'NOTAIRE';
      case ValidatorType.GEOMETRE:
        return 'GEOMETRE';
      case ValidatorType.EXPERT_JURIDIQUE:
        return 'EXPERT_JURIDIQUE';
      default:
        return 'UNKNOWN';
    }
  }

  private determineLandStatus(progress: ValidationProgress): string {
    if (progress.completed === 0) {
      return LandValidationStatus.PENDING_VALIDATION;
    }
    if (progress.completed < progress.total) {
      return LandValidationStatus.PARTIALLY_VALIDATED;
    }
    const allValid = progress.validations.every(v => v.validated);
    return allValid ? LandValidationStatus.VALIDATED : LandValidationStatus.REJECTED;
  }

  /**
 * Récupère les terrains qui n'ont pas été validés par un certain type de validateur
 * @param validatorRole Le rôle du validateur (GEOMETRE, EXPERT_JURIDIQUE, NOTAIRE)
 * @returns Liste des terrains avec URLs d'images et documents
 */
  async findLandsWithoutRoleValidation(validatorRole: string): Promise<EnhancedLandResult[]> {
    try {
      this.logger.log(`[${new Date().toISOString()}] Searching for lands without ${validatorRole} validation.`);

      // Mapper le rôle texte à sa valeur numérique selon l'enum ValidatorType
      let validatorTypeValue: number;

      switch (validatorRole) {
        case 'GEOMETRE':
          validatorTypeValue = 1; // ValidatorType.GEOMETRE
          break;
        case 'EXPERT_JURIDIQUE':
          validatorTypeValue = 2; // ValidatorType.EXPERT_JURIDIQUE
          break;
        case 'NOTAIRE':
          validatorTypeValue = 0; // ValidatorType.NOTAIRE
          break;
        default:
          throw new BadRequestException(`Invalid validator role: ${validatorRole}`);
      }

      // Construire la requête pour trouver les terrains sans validation du rôle spécifié
      const query = {
        $or: [
          { validations: { $size: 0 } }, // Terrains sans aucune validation
          { validations: { $not: { $elemMatch: { validatorType: validatorTypeValue } } } }, // Terrains sans validation du type spécifique
        ]
      };

      // Liste des attributs à récupérer
      const projection = {
        _id: 1,
        title: 1,
        description: 1,
        location: 1,
        surface: 1,
        latitude: 1,
        longitude: 1,
        imageCIDs: 1,
        ipfsCIDs: 1,
        amenities: 1,
        validations: 1,
        landtype: 1,
        ownerId: 1,
        ownerAddress: 1,
        status: 1,
        blockchainLandId: 1
      };

      // Exécuter la requête
      const lands = await this.landModel.find(query, projection).exec();

      // Transformer les terrains pour inclure les URLs des images et documents
      const enhancedLands: EnhancedLandResult[] = lands.map(land => {
        // Convertir en objet simple si c'est un document Mongoose
        const landObj: any = land.toObject ? land.toObject() : { ...land };

        // Créer des objets images avec URLs
        const imageInfos: IpfsFileInfo[] = (landObj.imageCIDs || []).map((cid, index) => ({
          cid: cid,
          url: this.ipfsService.getIPFSUrl(cid),
          index: index + 1
        }));

        // Créer des objets documents avec URLs
        const documentInfos: IpfsFileInfo[] = (landObj.ipfsCIDs || []).map((cid, index) => ({
          cid: cid,
          url: this.ipfsService.getIPFSUrl(cid),
          index: index + 1
        }));

        // Ajouter ces nouvelles propriétés à l'objet terrain
        landObj.imageInfos = imageInfos;
        landObj.documentInfos = documentInfos;

        // Ajouter des tableaux simples d'URLs pour faciliter l'utilisation
        landObj.imageUrls = imageInfos.map(img => img.url);
        landObj.documentUrls = documentInfos.map(doc => doc.url);

        // Ajouter une image de couverture si disponible
        landObj.coverImageUrl = imageInfos.length > 0 ? imageInfos[0].url : null;

        return landObj as EnhancedLandResult;
      });

      this.logger.log(`[${new Date().toISOString()}] Found ${enhancedLands.length} lands without ${validatorRole} validation.`);

      return enhancedLands;
    } catch (error) {
      this.logger.error(`[${new Date().toISOString()}] Error finding lands without ${validatorRole} validation. `, error.stack);
      throw new Error(`Failed to fetch lands without ${validatorRole} validation: ${error.message}`);
    }
  }

  /**
  * Récupère tous les terrains avec les URLs d'images et de documents
  * @returns Liste des terrains avec toutes les propriétés et URLs d'images et documents
  */
  async findAllLands(): Promise<EnhancedLandResult[]> {
    try {
      this.logger.log(`[${new Date().toISOString()}] Fetching all lands.`);

      // Exécuter la requête pour récupérer tous les terrains sans filtre
      const lands = await this.landModel.find().exec();

      // Transformer les terrains pour inclure les URLs des images et documents
      const enhancedLands: EnhancedLandResult[] = lands.map(land => {
        // Convertir en objet simple si c'est un document Mongoose
        const landObj: any = land.toObject ? land.toObject() : { ...land };

        // Créer des objets images avec URLs
        const imageInfos: IpfsFileInfo[] = (landObj.imageCIDs || []).map((cid, index) => ({
          cid: cid,
          url: this.ipfsService.getIPFSUrl(cid),
          index: index + 1
        }));

        // Créer des objets documents avec URLs
        const documentInfos: IpfsFileInfo[] = (landObj.ipfsCIDs || []).map((cid, index) => ({
          cid: cid,
          url: this.ipfsService.getIPFSUrl(cid),
          index: index + 1
        }));

        // Ajouter ces nouvelles propriétés à l'objet terrain
        landObj.imageInfos = imageInfos;
        landObj.documentInfos = documentInfos;

        // Ajouter des tableaux simples d'URLs pour faciliter l'utilisation
        landObj.imageUrls = imageInfos.map(img => img.url);
        landObj.documentUrls = documentInfos.map(doc => doc.url);

        // Ajouter une image de couverture si disponible
        landObj.coverImageUrl = imageInfos.length > 0 ? imageInfos[0].url : null;

        return landObj as EnhancedLandResult;
      });

      this.logger.log(`[${new Date().toISOString()}] Successfully retrieved ${enhancedLands.length} lands.`);

      return enhancedLands;
    } catch (error) {
      this.logger.error(`[${new Date().toISOString()}] Error fetching lands: `, error.stack);
      throw new Error(`Failed to fetch lands: ${error.message}`);
    }
  }
}