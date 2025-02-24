import { Injectable } from '@nestjs/common';
import { create } from 'ipfs-http-client';





@Injectable()
export class IpfsService {
  private ipfs;

  constructor() {
    this.ipfs = create({ url: process.env.IPFS_GATEWAY });
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
