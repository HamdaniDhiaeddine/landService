import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Land, LandDocument } from './schemas/land.schema';
import { LocationService } from '../location/location.service';
import { EncryptionService } from '../encryption/encryption.service';
import { IpfsService } from '../ipfs/ipfs.service';
import * as fs from 'fs';

@Injectable()
export class LandsService {
  constructor(
    @InjectModel(Land.name) private landModel: Model<LandDocument>,
    private locationService: LocationService,
    private encryptionService: EncryptionService,
    private ipfsService: IpfsService
  ) {}

  async createLand(data: any, files: Express.Multer.File[], images: Express.Multer.File[]): Promise<Land> {
    const { location } = data;

    // 🗺️ Fetch latitude & longitude
    const { latitude, longitude } = await this.locationService.getCoordinates(location);

    // 🔒 Encrypt & Upload Files to IPFS
    const ipfsCIDs: string[] = [];
    for (const file of files) {
      const encryptedData = this.encryptionService.encryptFile(file.path);
      const cid = await this.ipfsService.uploadFile(encryptedData);
      ipfsCIDs.push(cid);
      fs.unlinkSync(file.path); // ❌ Delete local file after upload
    }

    // 🖼️ Upload Images to IPFS (without encryption)
    const imageCIDs: string[] = [];
    for (const image of images) {
      const imageData = fs.readFileSync(image.path, 'utf-8');
      const cid = await this.ipfsService.uploadFile(imageData);
      imageCIDs.push(cid);
      fs.unlinkSync(image.path);
    }

    // 📝 Save to database
    const land = new this.landModel({ ...data, latitude, longitude, ipfsCIDs, imageCIDs });
    return land.save();
  }
}
