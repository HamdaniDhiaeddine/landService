import { Injectable, Logger, InternalServerErrorException, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Land } from './schemas/land.schema';
import { CreateLandDto } from './dto/create-land.dto';
import { UpdateLandDto } from './dto/update-land.dto';
import { IpfsService } from 'src/ipfs/ipfs.service';
import { EncryptionService } from 'src/encryption/encryption.service';
import * as fs from 'fs/promises';
import { BlockchainService } from 'src/blockchain/services/blockchain.service';
import { ethers } from 'ethers';
import { RelayerService } from 'src/blockchain/services/relayer.service';
import { Validation, ValidationDocument } from './schemas/validation.schema';
import { ObjectId } from 'mongodb';
import { LandValidationStatus, ValidateLandDto, ValidationMetadata, ValidationRequest, ValidationResponse } from 'src/blockchain/interfaces/validation.interface';
import { JWTPayload } from 'src/auth/interfaces/jwt-payload.interface';

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
      // 1. Traiter les documents
      const documentsCIDs = await this.processFiles(
        createLandDto.ipfsCIDs || [],
        'documents'
      );

      // 2. Traiter les images
      const imagesCIDs = await this.processFiles(
        createLandDto.imageCIDs || [],
        'images'
      );

      // 3. Créer le métadata pour IPFS
      const metadata = {
        title: createLandDto.title,
        description: createLandDto.description,
        location: createLandDto.location,
        surface: createLandDto.surface,
        coordinates: {
          latitude: createLandDto.latitude,
          longitude: createLandDto.longitude
        },
        documents: documentsCIDs,
        images: imagesCIDs,
        timestamp: new Date().toISOString()
      };

      // 4. Uploader le métadata sur IPFS
      const metadataCID = await this.ipfsService.uploadFile(
        Buffer.from(JSON.stringify(metadata))
      );

      // 5. Enregistrer sur la blockchain
      const blockchainTx = await this.blockchainService.registerLand({
        title: createLandDto.title,
        location: createLandDto.location,
        surface: createLandDto.surface,
        totalTokens: createLandDto.totalTokens,
        pricePerToken: createLandDto.pricePerToken,
        owner: ownerAddress, // Adresse Ethereum du propriétaire
        metadataCID
      });

      // 6. Créer l'entrée dans MongoDB
      const land = new this.landModel({
        ...createLandDto,
        ipfsCIDs: documentsCIDs,
        imageCIDs: imagesCIDs,
        metadataCID,
        blockchainTxHash: blockchainTx.hash,
        blockchainLandId: blockchainTx.landId,
        ownerAddress, // Stocker l'adresse Ethereum
        status: 'pending_validation'
      });

      const savedLand = await land.save();
      this.logger.log(`Land created with ID: ${savedLand._id}`, {
        landId: savedLand._id,
        blockchainTxHash: blockchainTx.hash,
        ownerAddress
      });

      return savedLand;
    } catch (error) {
      this.logger.error('Error in create land:', error);
      throw new InternalServerErrorException(
        `Failed to create land: ${error.message}`
      );
    }
  }

  private async processFiles(
    filePaths: string[],
    type: 'documents' | 'images'
  ): Promise<string[]> {
    const cids = [];
    for (const filePath of filePaths) {
      try {
        // 1. Lire le fichier
        const fileBuffer = await fs.readFile(filePath);

        // 2. Encrypter si c'est un document
        const bufferToUpload = type === 'documents'
          ? this.encryptionService.encryptBuffer(fileBuffer)
          : fileBuffer;

        // 3. Upload sur IPFS
        const cid = await this.ipfsService.uploadFile(bufferToUpload);
        cids.push(cid);

        // 4. Nettoyer le fichier temporaire
        await fs.unlink(filePath);

      } catch (error) {
        this.logger.error(`Error processing ${type} file ${filePath}:`, error);
      }
    }
    return cids;
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

  async findOne(id: string): Promise<Land> {
    const land = await this.landModel.findById(id).exec();
    if (!land) throw new NotFoundException(`Land with ID ${id} not found`);
    return land;
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
  
  async createValidation(validationData: {
    landId: string;
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



}
