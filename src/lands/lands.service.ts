import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Land, LandDocument } from './schemas/land.schema';
import { CreateLandDto } from './dto/create-land.dto';
import { UpdateLandDto } from './dto/update-land.dto';
import { IpfsService } from 'src/ipfs/ipfs.service';
import { EncryptionService } from 'src/encryption/encryption.service';


@Injectable()
export class LandService {
  constructor(
    @InjectModel(Land.name) private landModel: Model<LandDocument>,
    private readonly ipfsService: IpfsService,  // Inject IPFS service
    private readonly encryptionService: EncryptionService,  // Inject Encryption service
  ) {}

  async create(createLandDto: CreateLandDto & { ownerId: string }): Promise<Land> {
    // Process PDF documents (e.g., encrypt and upload to IPFS)
    const ipfsCIDs = [];
    if (createLandDto.ipfsCIDs && createLandDto.ipfsCIDs.length > 0) {
      for (const filePath of createLandDto.ipfsCIDs) {
        // Encrypt the document file and upload it to IPFS
        const encryptedFile = this.encryptionService.encryptFile(filePath);
        const cid = await this.ipfsService.uploadFile(encryptedFile);
        ipfsCIDs.push(cid);  // Store the CID
      }
    }

    // Process images (e.g., encrypt and upload to IPFS)
    const imageCIDs = [];
    if (createLandDto.imageCIDs && createLandDto.imageCIDs.length > 0) {
      for (const imagePath of createLandDto.imageCIDs) {
        // Encrypt the image file and upload it to IPFS
        const encryptedImage = this.encryptionService.encryptFile(imagePath);
        const imageCid = await this.ipfsService.uploadFile(encryptedImage);
        imageCIDs.push(imageCid);  // Store the CID
      }
    }

    // Add the encrypted file CIDs to the DTO
    createLandDto.ipfsCIDs = ipfsCIDs;
    createLandDto.imageCIDs = imageCIDs;

    // Create the land document and save to the database
    const land = new this.landModel(createLandDto);
    return land.save();
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
