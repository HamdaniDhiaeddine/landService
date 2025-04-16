import { Land } from '../schemas/land.schema';
import { Document, Types } from 'mongoose';

// Interface pour représenter les informations sur un fichier IPFS
export interface IpfsFileInfo {
  cid: string;
  url: string;
  index: number;
}

// Interface pour les terrains enrichis avec les URLs
export interface EnhancedLand extends Document {
  _id: Types.ObjectId;
  title: string;
  description?: string;
  location: string;
  surface: number;
  latitude?: number;
  longitude?: number;
  imageCIDs?: string[];
  ipfsCIDs?: string[];
  amenities?: Map<string, boolean>;
  validations?: any[];
  landtype?: string;
  ownerId?: string;
  ownerAddress: string;
  status?: string;
  blockchainLandId?: number;
  
  // Propriétés ajoutées dynamiquement
  imageInfos?: IpfsFileInfo[];
  documentInfos?: IpfsFileInfo[];
  imageUrls?: string[];
  documentUrls?: string[];
  coverImageUrl?: string | null;
}

// Type pour le résultat de la fonction
export type EnhancedLandResult = Omit<EnhancedLand, keyof Document>;