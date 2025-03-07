import { Injectable } from '@nestjs/common';
import { create } from 'ipfs-http-client';

@Injectable()
export class IpfsService {
  private ipfs;

  constructor() {
    // Use environment variables for Infura's project ID and secret
    const projectId = process.env.IPFS_PROJECT_ID;
    const projectSecret = process.env.IPFS_PROJECT_SECRET;
    const auth = 'Basic ' + Buffer.from(`${projectId}:${projectSecret}`).toString('base64');

    this.ipfs = create({
      url: 'https://ipfs.infura.io:5001/api/v0',
      headers: {
        Authorization: auth,
      },
    });
  }

  async uploadFile(data: string): Promise<string> {
    const { cid } = await this.ipfs.add(data);
    return cid.toString();
  }

  async getFile(cid: string): Promise<string> {
    const stream = this.ipfs.cat(cid);
    let content = '';

    for await (const chunk of stream) {
      content += new TextDecoder().decode(chunk);
    }

    return content;
  }
}
