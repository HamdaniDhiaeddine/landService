import { Injectable, Logger, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Land, LandDocument } from './schemas/land.schema';
import { CreateLandDto } from './dto/create-land.dto';
import { UpdateLandDto } from './dto/update-land.dto';
import { IpfsService } from 'src/ipfs/ipfs.service';
import { EncryptionService } from 'src/encryption/encryption.service';
import * as fs from 'fs/promises';

@Injectable()
export class LandService {
  private readonly logger = new Logger(LandService.name);

  constructor(
    @InjectModel(Land.name) private landModel: Model<LandDocument>,
    private readonly ipfsService: IpfsService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async create(createLandDto: CreateLandDto & { ownerId: string }): Promise<Land> {
    const ipfsCIDs = [];
    if (createLandDto.ipfsCIDs && createLandDto.ipfsCIDs.length > 0) {
      for (const filePath of createLandDto.ipfsCIDs) {
        try {
          // Read file as buffer
          const fileBuffer = await fs.readFile(filePath);
          this.logger.debug(`Read file: ${filePath}, size: ${fileBuffer.length} bytes`);

          // Encrypt the buffer
          const encryptedBuffer = this.encryptionService.encryptBuffer(fileBuffer);
          this.logger.debug(`Encrypted file: ${filePath}, size: ${encryptedBuffer.length} bytes`);

          // Upload encrypted buffer to IPFS
          const cid = await this.ipfsService.uploadFile(encryptedBuffer);
          this.logger.debug(`Uploaded file to IPFS: ${filePath}, CID: ${cid}`);

          ipfsCIDs.push(cid);

          // Clean up the temporary file
          await fs.unlink(filePath);
        } catch (error) {
          this.logger.error(`Error processing file ${filePath}:`, error.stack);
          // Continue with other files even if one fails
        }
      }
    }

    const imageCIDs = [];
    if (createLandDto.imageCIDs && createLandDto.imageCIDs.length > 0) {
      for (const imagePath of createLandDto.imageCIDs) {
        try {
          // Read image as buffer
          const imageBuffer = await fs.readFile(imagePath);
          this.logger.debug(`Read image: ${imagePath}, size: ${imageBuffer.length} bytes`);

          // Encrypt the buffer
          const encryptedBuffer = this.encryptionService.encryptBuffer(imageBuffer);
          this.logger.debug(`Encrypted image: ${imagePath}, size: ${encryptedBuffer.length} bytes`);

          // Upload encrypted buffer to IPFS
          const imageCid = await this.ipfsService.uploadFile(encryptedBuffer);
          this.logger.debug(`Uploaded image to IPFS: ${imagePath}, CID: ${imageCid}`);

          imageCIDs.push(imageCid);

          // Clean up the temporary file
          await fs.unlink(imagePath);
        } catch (error) {
          this.logger.error(`Error processing image ${imagePath}:`, error.stack);
          // Continue with other images even if one fails
        }
      }
    }

    // Update the DTO with the CIDs
    createLandDto.ipfsCIDs = ipfsCIDs;
    createLandDto.imageCIDs = imageCIDs;

    // Create and save the land document
    const land = new this.landModel(createLandDto);
    return land.save();
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
}
