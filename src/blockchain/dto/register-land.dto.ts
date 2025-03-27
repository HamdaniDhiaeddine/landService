import { IsString, IsNumber, IsNotEmpty } from 'class-validator';

export class RegisterLandDto {
  @IsString()
  @IsNotEmpty()
  location: string;

  @IsNumber()
  @IsNotEmpty()
  surface: number;

  @IsNumber()
  @IsNotEmpty()
  totalTokens: number;

  @IsString()
  @IsNotEmpty()
  pricePerToken: string;

  @IsString()
  @IsNotEmpty()
  cid: string;
}