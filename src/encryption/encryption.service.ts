import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-ctr';
  private readonly key: Buffer;

  constructor() {
    // Convert the secret key to a 32-byte key using SHA256
    const secretKey = process.env.AES_SECRET_KEY || 'your_default_secret_key';
    this.key = crypto.createHash('sha256').update(String(secretKey)).digest();
  }

  encryptBuffer(buffer: Buffer): Buffer {
    try {
      // Generate a random 16-byte IV
      const iv = crypto.randomBytes(16);
      
      // Create cipher with derived key
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
      
      // Encrypt the data and combine IV with encrypted content
      const encryptedBuffer = Buffer.concat([
        iv,
        cipher.update(buffer),
        cipher.final()
      ]);
      
      return encryptedBuffer;
    } catch (error) {
      console.error('Encryption error:', error);
      throw error;
    }
  }

  decryptBuffer(encryptedBuffer: Buffer): Buffer {
    try {
      // Extract the IV from the first 16 bytes
      const iv = encryptedBuffer.slice(0, 16);
      const encryptedData = encryptedBuffer.slice(16);
      
      // Create decipher with derived key
      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      
      // Decrypt the data
      return Buffer.concat([
        decipher.update(encryptedData),
        decipher.final()
      ]);
    } catch (error) {
      console.error('Decryption error:', error);
      throw error;
    }
  }
}