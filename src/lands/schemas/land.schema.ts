import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ValidatorType, LandValidationStatus, LandType, ValidationEntry } from 'src/blockchain/interfaces/validation.interface';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Land {
  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop({ required: true })
  location: string;

  @Prop({ required: true })
  surface: number;

  @Prop({ required: false })
  totalTokens: number;

  @Prop({ required: false })
  pricePerToken: string;

  @Prop({ required: false })
  priceland: string;

  @Prop({ required: true })
  ownerId: string;

  @Prop({ required: true })
  ownerAddress: string;

  @Prop()
  latitude?: number;

  @Prop()
  longitude?: number;

  @Prop({
    required: true,
    enum: LandValidationStatus,
    default: LandValidationStatus.PENDING_VALIDATION
  })
  status: LandValidationStatus;

  @Prop({
    required: true,
    enum: LandType,
  })
  landtype: LandType;

  @Prop({ type: [String], default: [] })
  ipfsCIDs: string[];

  @Prop({ type: [String], default: [] })
  imageCIDs: string[];

  @Prop()
  blockchainTxHash: string;

  @Prop({
    type: String,
    required: true,
  })
  blockchainLandId;

  @Prop({
    default: []
  })
  validations: ValidationEntry[];

  @Prop({
    type: Map,
    of: Boolean,
    default: new Map()
  })
  amenities: Map<string, boolean>;

  // NOUVEAUX CHAMPS POUR LA TOKENISATION

  @Prop({ default: false })
  isTokenized: boolean;
  
  @Prop()
  tokenizationTxHash: string;
  
  @Prop()
  tokenizationTimestamp: Date;
  
  @Prop()
  tokenizationError: string;
  
  @Prop({
    type: [{
      timestamp: { type: Date, default: Date.now },
      error: String,
      txHash: String
    }],
    default: []
  })
  tokenizationAttempts: { timestamp: Date, error?: string, txHash?: string }[];
  
  // Nombre de tokens disponibles (utile à suivre)
  @Prop({ default: 0 })
  availableTokens: number;
  
  // Information sur les tokens créés à partir de ce terrain
  @Prop({ type: [Number], default: [] })
  tokenIds: number[];
}

export type LandDocument = Land & Document;
export const LandSchema = SchemaFactory.createForClass(Land);