import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { create } from 'ipfs-http-client';

@Injectable()
export class IpfsService {
  private ipfs;
  private readonly logger = new Logger(IpfsService.name);

  constructor() {
    try {
      // Connect to local IPFS node
      this.ipfs = create({
        host: 'localhost',
        port: 5001,
        protocol: 'http'
      });
    } catch (error) {
      this.logger.error('Failed to initialize IPFS client', error.stack);
      throw new InternalServerErrorException('Failed to initialize IPFS service');
    }
  }

  async uploadFile(data: Buffer | string): Promise<string> {
    try {
      const { cid } = await this.ipfs.add(data);
      this.logger.log(`Successfully uploaded file to IPFS with CID: ${cid}`);
      return cid.toString();
    } catch (error) {
      this.logger.error('Failed to upload file to IPFS', error.stack);
      throw new InternalServerErrorException('Failed to upload file to IPFS: ' + error.message);
    }
  }

  async getFile(cid: string): Promise<Buffer> {
    try {
      const chunks = [];
      for await (const chunk of this.ipfs.cat(cid)) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (error) {
      this.logger.error(`Failed to retrieve file from IPFS with CID: ${cid}`, error.stack);
      throw new InternalServerErrorException('Failed to retrieve file from IPFS');
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const testBuffer = Buffer.from('IPFS Connection Test');
      const cid = await this.uploadFile(testBuffer);
      const result = await this.getFile(cid);
      return testBuffer.equals(result);
    } catch (error) {
      this.logger.error('IPFS connection test failed', error.stack);
      return false;
    }
  }
}