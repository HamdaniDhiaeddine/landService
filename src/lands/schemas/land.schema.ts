import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type LandDocument = Land & Document;

@Schema({ timestamps: true })
export class Land {
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) description: string;
  @Prop({ required: false }) location: string;
  @Prop({ required: true }) price: number;

  @Prop({ required: false }) ownerId: string; // Extracted from JWT token

  @Prop({ required: false }) latitude?: number; // Google Maps API
  @Prop({ required: false }) longitude?: number; // Google Maps API

  @Prop({ required: false, default: 'pending' }) status: string;

  @Prop({ required: false }) ipfsCIDs?: string[]; // IPFS storage for documents
  @Prop({ required: false }) imageCIDs?: string[]; // 🔹 IPFS storage for land images
}

export const LandSchema = SchemaFactory.createForClass(Land);
