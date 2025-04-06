import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ValidatorType, LandValidationStatus } from 'src/blockchain/interfaces/validation.interface';

// Interface pour la structure de validation
interface ValidationEntry {
  validator: string;
  validatorType: ValidatorType;
  timestamp: number;
  isValidated: boolean;
  cidComments: string;
}

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

  @Prop({ required: true })
  totalTokens: number;

  @Prop({ required: true })
  pricePerToken: string;

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

  @Prop({ type: [String], default: [] })
  ipfsCIDs: string[];

  @Prop({ type: [String], default: [] })
  imageCIDs: string[];

  @Prop()
  metadataCID: string;

  @Prop()
  blockchainTxHash: string;

  @Prop()
  blockchainId: string;

  @Prop({
    type: [{
      validator: String,
      validatorType: { type: Number, enum: ValidatorType },
      timestamp: Number,
      isValidated: Boolean,
      cidComments: String
    }],
    default: []
  })
  validations: ValidationEntry[];
}

export type LandDocument = Land & Document;
export const LandSchema = SchemaFactory.createForClass(Land);