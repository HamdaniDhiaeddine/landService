// src/lands/schemas/validation.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ValidatorType } from 'src/blockchain/interfaces/validation.interface';

@Schema({
    timestamps: true,
    collection: 'validations'
  })
  export class Validation {
    @Prop({ required: true })
    landId: string;
  
    @Prop({ required: true })
    blockchainLandId: string;
  
    @Prop({ required: true })
    validator: string;
  
  
    @Prop({ required: true })
    timestamp: number;
  
    @Prop({ required: true })
    cidComments: string;
  
    @Prop({ required: true })
    isValidated: boolean;
  
    @Prop({ required: true })
    txHash: string;
  
    @Prop({ required: true })
    blockNumber: number;
  }
  
  export const ValidationSchema = SchemaFactory.createForClass(Validation);