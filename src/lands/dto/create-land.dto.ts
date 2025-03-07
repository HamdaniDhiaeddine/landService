import { IsString, IsNumber, IsOptional, IsArray } from 'class-validator';

export class CreateLandDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  location: string;

  //@IsNumber()
  //price: number;

  @IsString()
  ownerId: string;

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
}
