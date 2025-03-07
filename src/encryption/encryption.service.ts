import { Injectable } from '@nestjs/common';
import * as CryptoJS from 'crypto-js';
import * as fs from 'fs';

@Injectable()
export class EncryptionService {
  private readonly key = process.env.AES_SECRET_KEY; 

  encryptFile(filePath: string): string {
    const fileData = fs.readFileSync(filePath, 'utf-8');
    return CryptoJS.AES.encrypt(fileData, this.key).toString();
  }

  decryptFile(encryptedText: string): string {
    const bytes = CryptoJS.AES.decrypt(encryptedText, this.key);
    return bytes.toString(CryptoJS.enc.Utf8);
  }
}
