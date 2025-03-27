import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type LandDocument = Land & Document;

@Schema({ timestamps: true })
export class Land {
  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop({ required: true })
  location: string;

  //@Prop({ required: true })
  //price: number;

  @Prop({ required: true })
  ownerId: string;

  @Prop()
  latitude?: number;

  @Prop()
  longitude?: number;

  @Prop({ required: true, enum: ['available', 'sold', 'reserved'], default: 'available' })
  status: string;

  @Prop({ type: [String], default: [] })
  ipfsCIDs?: string[];

  @Prop({ type: [String], default: [] })
  imageCIDs?: string[];
}

export const LandSchema = SchemaFactory.createForClass(Land);
