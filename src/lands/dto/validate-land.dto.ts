import { IsString, IsBoolean, IsNotEmpty, IsOptional } from 'class-validator';

export class ValidateLandDto {
    @IsString()
    @IsNotEmpty()
    comment: string;

    @IsBoolean()
    @IsNotEmpty()
    isValid: boolean;

    @IsString()
    @IsOptional()
    landId?: string;

    @IsString()
    @IsOptional()
    txHash?: string;
}