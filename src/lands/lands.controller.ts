import { Controller, Post, Body, UseGuards, Request, UseInterceptors, UploadedFiles } from '@nestjs/common';
import { LandsService } from './lands.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FilesInterceptor, AnyFilesInterceptor } from '@nestjs/platform-express';
import { multerConfig } from '../config/multer.config';

@Controller('lands')
export class LandsController {
  constructor(private readonly landsService: LandsService) {}

  @UseGuards(JwtAuthGuard) // Require authentication
  @Post('upload')
  @UseInterceptors(FilesInterceptor('documents', 5, multerConfig)) // Max 5 files
  @UseInterceptors(AnyFilesInterceptor(multerConfig)) // Handle multiple image uploads
  async addLand(
    @UploadedFiles() files: Express.Multer.File[],
    @UploadedFiles() images: Express.Multer.File[],
    @Body() landData: any,
    @Request() req: any
  ) {
    const ownerId = req.user.userId; // Extract user ID from JWT
    return this.landsService.createLand({ ...landData, ownerId }, files, images);
  }
}
