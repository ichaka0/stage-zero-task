import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class CreateProfileDto {
    @IsString()
    @IsNotEmpty()
    @MinLength(3)
    @MaxLength(255)
    name: string;
}
