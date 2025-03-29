import { Controller, Get, Post, Body, Patch, Param, Delete, UseInterceptors, UploadedFiles, Res, UseGuards } from '@nestjs/common';
import { CreateLandDto } from './dto/create-land.dto';
import { UpdateLandDto } from './dto/update-land.dto';
import { LandService } from './lands.service';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { multerConfig } from 'src/config/multer.config';
import { Response } from 'express';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { PermissionGuard } from 'src/auth/guards/permission.guard';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { Resource } from 'src/auth/enums/resource.enum';
import { Action } from 'src/auth/enums/action.enum';


@Controller('lands')
@UseGuards(JwtAuthGuard, PermissionGuard)
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
  @RequirePermissions({
    resource: Resource.LAND,
    actions: [Action.UPLOAD_LAND]
  })
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
  @RequirePermissions({
    resource: Resource.LAND,
    actions: [Action.VIEW_OWN_LANDS]
  })
  findAll() {
    return this.landService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.landService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions({
    resource: Resource.LAND,
    actions: [Action.EDIT_LAND]
  })
  update(@Param('id') id: string, @Body() updateLandDto: UpdateLandDto) {
    return this.landService.update(id, updateLandDto);
  }

  @Delete(':id')
  @RequirePermissions({
    resource: Resource.LAND,
    actions: [Action.DELETE_LAND]
  })
  remove(@Param('id') id: string) {
    return this.landService.remove(id);
  }

  @Get('file/:cid')
  async getFile(@Param('cid') cid: string, @Res() res: Response): Promise<void> {
    const fileBuffer = await this.landService.getDecryptedFile(cid);
    // Use res.buffer() for binary data
    res.type('application/octet-stream').send(fileBuffer);
  }
}
