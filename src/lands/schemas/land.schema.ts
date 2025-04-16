import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ValidatorType, LandValidationStatus, LandType, ValidationEntry } from 'src/blockchain/interfaces/validation.interface';



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
    type: [{
      validator: String,
      validatorType: { type: Number, enum: ValidatorType },
      timestamp: Number,
      isValidated: Boolean,
      cidComments: String,
    }],
    default: []
  })
  validations: ValidationEntry[];
  @Prop({
    type: Map,
    of: Boolean,
    default: new Map()
  })
  amenities: Map<string, boolean>;

  
}

export type LandDocument = Land & Document;
export const LandSchema = SchemaFactory.createForClass(Land);