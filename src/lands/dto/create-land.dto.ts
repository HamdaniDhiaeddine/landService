// Ajout du champ fileBuffers dans le DTO
import { Type } from 'class-transformer';
import { IsString, IsNumber, IsOptional, IsArray, Min, IsEthereumAddress, IsObject, ValidateNested } from 'class-validator';
import { AmenitiesDto } from './Amenities.dto';

export class FileBufferDto {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

export class FileBuffersDto {
  documents: FileBufferDto[];
  images: FileBufferDto[];
}

export class CreateLandDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  location: string;

  @IsString()
  //@Min(0)
  surface: string;

  @IsNumber()
  @IsOptional()
  totalTokens?: number;

  @IsString()
  @IsOptional()
  pricePerToken?: string;

  @IsOptional()
  @IsString()
  latitude?: string;

  @IsOptional()
  @IsString()
  longitude?: string;

  @IsString()
  status: string;

  @IsString()
  landtype: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ipfsCIDs?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageCIDs?: string[];

  // Nouveau champ pour stocker les buffers
  @IsOptional()
  fileBuffers?: FileBuffersDto;

  // Champ ajouté automatiquement par le guard
  ownerId: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AmenitiesDto)
  amenities?: AmenitiesDto;
}