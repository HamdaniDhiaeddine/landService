import { IsString, IsBoolean, IsNotEmpty } from 'class-validator';


export class ValidateLandDto {

    @IsString()
    @IsNotEmpty()
    cidComments: string;


    @IsBoolean()
    @IsNotEmpty()
    isValid: boolean;
}