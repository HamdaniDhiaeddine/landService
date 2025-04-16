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
import { LandValidationStatus, ValidationDocument, ValidationMetadata, ValidationProgress, ValidationRequest, ValidationResponse, ValidatorType } from 'src/blockchain/interfaces/validation.interface';
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
    private readonly relayerService: RelayerService
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
        timestamp: new Date().toISOString(),
        user: 'nesssim'
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



      // Créer les métadonnées de validation avec le rôle directement comme ValidatorType
      const validationMetadata: ValidationMetadata = {
        text: request.comment,
        validator: user.ethAddress,
        validatorRole: user.role,
        validatorEmail: user.email,
        userId: user.userId,
        landId: blockchainLandId,
        timestamp: Math.floor(Date.now() / 1000),
        isValid: request.isValid,
        validationType: this.getValidatorTypeEnum(user.role)
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

      // Créer le document de validation
      const validationDoc: ValidationDocument = {
        landId: land._id.toString(),
        blockchainLandId: blockchainLandId,
        validator: user.ethAddress,
        validatorType: user.role as unknown as ValidatorType, // Cast direct
        timestamp: validationMetadata.timestamp,
        cidComments,
        isValidated: request.isValid,
        txHash: validationResult.validationDetails.txHash,
        blockNumber: validationResult.validationDetails.blockNumber,
        createdAt: new Date('2025-04-04 18:33:53')
      };

      const savedValidation = await this.validationModel.create(validationDoc);

      const updateResult = await this.landModel.findOneAndUpdate(
        { blockchainLandId: blockchainLandId },
        {
          $push: {
            validations: {
              validator: user.ethAddress,
              validatorType: this.getValidatorTypeEnum(user.role),
              timestamp: validationMetadata.timestamp,
              isValidated: request.isValid,
              cidComments: cidComments
            }
          }
        },
        { new: true }  // Retourner le document mis à jour
      );

      this.logger.log('Land document updated with validation', {
        landId: land._id,
        validationsCount: updateResult.validations ? updateResult.validations.length : 0
      });

      // Calculer la progression de la validation
      const validationProgress = await this.calculateValidationProgressFromLand(updateResult);

      const newStatus = this.determineLandStatus(validationProgress);
      await this.landModel.findOneAndUpdate(
        { blockchainLandId: blockchainLandId },
        { $set: { status: newStatus } },
        { new: true }
      );

      const response: ValidationResponse = {
        success: true,
        message: 'Validation processed successfully',
        data: {
          transaction: {
            hash: validationResult.validationDetails.txHash,
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
              cidComments
            },
            validationProgress
          }
        }
      };

      this.logger.log('Validation completed successfully', {
        blockchainLandId: blockchainLandId,
        validator: user.ethAddress,
        role: user.role,
        txHash: validationResult.validationDetails.txHash,
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


  private async calculateValidationProgress(blockchainLandId: string): Promise<ValidationProgress> {
    const validations = await this.validationModel.find({ blockchainLandId }).exec();

    this.logger.log('Calculating validation progress', {
      blockchainLandId,
      validationsCount: validations.length,
      timestamp: '2025-04-04 18:26:46',
      userLogin: 'dalikhouaja008'
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

    validations.forEach(validation => {
      const validatorRole = this.getValidatorRoleString(validation.validatorType);
      const validationEntry = progress.validations.find(v => v.role === validatorRole);

      if (validationEntry && validation.isValidated) {
        validationEntry.validated = true;
        validationEntry.timestamp = validation.timestamp;
        validationEntry.validator = validation.validator;
        progress.completed++;
      }
    });

    progress.percentage = (progress.completed / progress.total) * 100;

    this.logger.log('Validation progress calculated', {
      blockchainLandId,
      completed: progress.completed,
      percentage: progress.percentage,
    });

    return progress;
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
    * Récupère les terrains sans validation de géomètre avec URLs d'images
    */
  async findLandsWithoutGeometerValidation(): Promise<EnhancedLandResult[]> {
    try {
      this.logger.log(`[${new Date().toISOString()}] Searching for lands without geometer validation.`);

      // Utilisez la valeur numérique 1 au lieu de 'GEOMETRE' pour le validatorType
      const validatorTypeGeometre = 1; // 1 = Géomètre

      // Requête modifiée avec le type numérique
      const query = {
        $or: [
          { validations: { $size: 0 } },
          { validations: { $not: { $elemMatch: { validatorType: validatorTypeGeometre } } } },
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

      this.logger.log(`[${new Date().toISOString()}] Found ${enhancedLands.length} lands without geometer validation.`);

      return enhancedLands;
    } catch (error) {
      this.logger.error(`[${new Date().toISOString()}] Error finding lands without geometer validation. `, error.stack);
      throw new Error(`Failed to fetch lands without geometer validation: ${error.message}`);
    }


  }
}