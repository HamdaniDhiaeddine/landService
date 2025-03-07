import { Controller, Get, Post, Body, Patch, Param, Delete, UseInterceptors, UploadedFiles } from '@nestjs/common';
import { CreateLandDto } from './dto/create-land.dto';
import { UpdateLandDto } from './dto/update-land.dto';
import { LandService } from './lands.service';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { multerConfig } from 'src/config/multer.config';


@Controller('lands')
export class LandController {
  constructor(private readonly landService: LandService) {}

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'documents', maxCount: 5 },  // For PDFs or other documents
        { name: 'images', maxCount: 10 }     // For photos (JPG, PNG)
      ],
      multerConfig,  // Use your multer config
    ),
  )
  async create(@Body() createLandDto: CreateLandDto, @UploadedFiles() files: any) {
    // Map the uploaded files' paths to the DTO
    if (files?.documents) {
      createLandDto.ipfsCIDs = files.documents.map(file => file.path);  // Store document file paths
    }
    if (files?.images) {
      createLandDto.imageCIDs = files.images.map(file => file.path);     // Store image file paths
    }

    // Pass the DTO to the service to handle encryption and IPFS upload
    return this.landService.create(createLandDto);
  }

  @Get()
  findAll() {
    return this.landService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.landService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateLandDto: UpdateLandDto) {
    return this.landService.update(id, updateLandDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.landService.remove(id);
  }
}
