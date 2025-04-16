import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import pinataSDK from '@pinata/sdk';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Readable } from 'stream';

@Injectable()
export class IpfsService {
  private pinata;
  private readonly logger = new Logger(IpfsService.name);
  private readonly gateway: string;

  constructor(private configService: ConfigService) {
    try {
      const apiKey = this.configService.get<string>('PINATA_API_KEY');
      const apiSecret = this.configService.get<string>('PINATA_API_SECRET');
      
      if (!apiKey || !apiSecret) {
        throw new Error('Pinata API credentials are missing');
      }
      
      // Initialiser le SDK Pinata
      this.pinata = new pinataSDK(apiKey, apiSecret);
      
      // Définir le gateway pour récupérer les fichiers
      this.gateway = this.configService.get<string>('PINATA_GATEWAY', 'https://gateway.pinata.cloud/ipfs/');
      
      // Vérifier la connexion à l'initialisation
      this.pinata.testAuthentication()
        .then(() => this.logger.log('Successfully connected to Pinata'))
        .catch(error => {
          this.logger.error('Failed to authenticate with Pinata', error.stack);
        });
      
    } catch (error) {
      this.logger.error('Failed to initialize Pinata client', error.stack);
      throw new InternalServerErrorException('Failed to initialize IPFS service');
    }
  }

  async uploadFile(data: Buffer | string): Promise<string> {
    try {
      // Convertir en Buffer si c'est une chaîne
      const buffer = typeof data === 'string' ? Buffer.from(data) : data;
      
      // Créer un stream à partir du buffer
      const stream = Readable.from(buffer);
      
      // Options pour l'upload Pinata
      const options = {
        pinataMetadata: {
          name: `file-${Date.now()}`,
        },
      };
      
      // Uploader le fichier
      const result = await this.pinata.pinFileToIPFS(stream, options);
      this.logger.log(`Successfully uploaded file to IPFS with CID: ${result.IpfsHash}`);
      
      return result.IpfsHash;
    } catch (error) {
      this.logger.error('Failed to upload file to IPFS', error.stack);
      throw new InternalServerErrorException('Failed to upload file to IPFS: ' + error.message);
    }
  }

  async getFile(cid: string): Promise<Buffer> {
    try {
      // Utiliser le gateway pour récupérer le fichier
      const response = await axios.get(`${this.gateway}${cid}`, { 
        responseType: 'arraybuffer' 
      });
      
      this.logger.log(`Successfully retrieved file from IPFS with CID: ${cid}`);
      return Buffer.from(response.data);
    } catch (error) {
      this.logger.error(`Failed to retrieve file from IPFS with CID: ${cid}`, error.stack);
      throw new InternalServerErrorException('Failed to retrieve file from IPFS');
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.pinata.testAuthentication();
      return true;
    } catch (error) {
      this.logger.error('IPFS connection test failed', error.stack);
      return false;
    }
  }

  async uploadComment(comment: string): Promise<string> {
    try {
      const buffer = Buffer.from(comment, 'utf-8');
      return await this.uploadFile(buffer);
    } catch (error) {
      this.logger.error('Failed to upload comment to IPFS', error.stack);
      throw new InternalServerErrorException('Failed to upload comment to IPFS: ' + error.message);
    }
  }
}