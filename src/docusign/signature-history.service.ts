// src/docusign/signature-history.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SignatureHistory } from './schema/signature-history.schema';


@Injectable()
export class SignatureHistoryService {
  private readonly logger = new Logger(SignatureHistoryService.name);
  
  constructor(
    @InjectModel(SignatureHistory.name) private signatureHistoryModel: Model<SignatureHistory>,
  ) {}
  
  async create(data: {
    envelopeId: string;
    userId: string;
    signerEmail: string;
    signerName: string;
    title: string;
  }): Promise<SignatureHistory> {
    const newSignature = new this.signatureHistoryModel({
      ...data,
      status: 'created',
    });
    
    return newSignature.save();
  }
  
  async updateStatus(envelopeId: string, status: string): Promise<SignatureHistory> {
    const signatureRecord = await this.signatureHistoryModel.findOne({ envelopeId });
    
    if (!signatureRecord) {
      this.logger.warn(`Enveloppe ${envelopeId} non trouvée dans la base de données`);
      return null;
    }
    
    signatureRecord.status = status;
    
    if (status === 'completed') {
      signatureRecord.completedAt = new Date();
    }
    
    return signatureRecord.save();
  }
  
  async updateDocumentUrl(envelopeId: string, documentUrl: string): Promise<SignatureHistory> {
    return this.signatureHistoryModel.findOneAndUpdate(
      { envelopeId },
      { documentUrl },
      { new: true }
    );
  }
  
  async findByEnvelopeId(envelopeId: string): Promise<SignatureHistory> {
    return this.signatureHistoryModel.findOne({ envelopeId });
  }
  
  async findByUserId(userId: string): Promise<SignatureHistory[]> {
    return this.signatureHistoryModel.find({ userId }).sort({ createdAt: -1 });
  }

  /**
 * Enregistre un accès au document signé
 */
async updateDocumentAccess(envelopeId: string, userId: string): Promise<void> {
  const signatureRecord = await this.signatureHistoryModel.findOne({ envelopeId });
  
  if (signatureRecord) {
    // Créer un tableau d'accès s'il n'existe pas encore
    if (!signatureRecord.documentAccesses) {
      signatureRecord.documentAccesses = [];
    }
    
    // Ajouter un nouvel enregistrement d'accès
    signatureRecord.documentAccesses.push({
      userId: userId,
      accessDate: new Date()
    });
    
    await signatureRecord.save();
    this.logger.log(`Accès au document ${envelopeId} enregistré pour l'utilisateur ${userId}`);
  } else {
    this.logger.warn(`Enveloppe ${envelopeId} non trouvée lors de l'enregistrement de l'accès`);
  }
}
}