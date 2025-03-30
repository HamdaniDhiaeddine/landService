import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

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
  ownerAddress: string; // Adresse Ethereum du propriétaire

  @Prop()
  latitude?: number;

  @Prop()
  longitude?: number;

  @Prop({ 
    required: true, 
    enum: ['pending_validation', 'validated', 'rejected', 'tokenized'], 
    default: 'pending_validation' 
  })
  status: string;

  @Prop({ type: [String], default: [] })
  ipfsCIDs: string[];

  @Prop({ type: [String], default: [] })
  imageCIDs: string[];

  @Prop()
  metadataCID: string;

  @Prop()
  blockchainTxHash: string;

  @Prop()
  blockchainLandId: string;
}

export const LandSchema = SchemaFactory.createForClass(Land);