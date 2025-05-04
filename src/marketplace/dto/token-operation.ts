import { IsNotEmpty, IsString, IsNumber, IsEthereumAddress, IsPositive, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListTokenDto {
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  tokenId: number;

  @IsNotEmpty()
  @IsString()
  price: string;
}

export class TransferTokenDto {
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  tokenId: number;

  @IsNotEmpty()
  @IsEthereumAddress()
  to: string;
}

export class BuyTokenDto {
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  tokenId: number;

  @IsNotEmpty()
  @IsString()
  value: string;
}

export class CancelListingDto {
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  tokenId: number;
}