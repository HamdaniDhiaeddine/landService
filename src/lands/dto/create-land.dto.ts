import { IsString, IsNumber, IsOptional, IsArray, Min, IsEthereumAddress } from 'class-validator';

export class CreateLandDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  location: string;

  @IsNumber()
  @Min(0)
  surface: number;

  @IsNumber()
  @Min(1)
  totalTokens: number;

  @IsString()
  pricePerToken: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsString()
  status: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ipfsCIDs?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageCIDs?: string[];

  // Champ ajouté automatiquement par le guard
  ownerId: string;

}