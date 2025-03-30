import { Controller, Get, Post, Body, Patch, Param, Delete, UseInterceptors, UploadedFiles, Res, UseGuards, Req, BadRequestException } from '@nestjs/common';
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
import { JWTPayload } from 'src/auth/interfaces/jwt-payload.interface';


@Controller('lands')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class LandController {
  constructor(private readonly landService: LandService) { }

  @Post()
  @RequirePermissions({
    resource: Resource.LAND,
    actions: ['upload_land']
  })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'documents', maxCount: 5 },
      { name: 'images', maxCount: 10 }
    ])
  )
  async create(
    @Body() createLandDto: CreateLandDto,
    @UploadedFiles() files: any,
    @Req() req: Request
  ) {
    

    const user = (req as any).user as JWTPayload;

    console.log('\n====== JWT Payload Details ======');
    console.log('Timestamp:', new Date().toISOString());
    console.log('User ID:', user.userId);
    console.log('Email:', user.email);
    console.log('Role:', user.role);
    console.log('Ethereum Address:', user.ethAddress || 'Not found in token');
    console.log('=============================\n');

    // Vérifier que l'utilisateur a une adresse Ethereum
    if (!user.ethAddress) {
      throw new BadRequestException(
        'Ethereum address is required to register land'
      );
    }

    console.log('✅ Ethereum address verification successful:', {
      address: user.ethAddress,
      timestamp: new Date().toISOString()
    });

    // Ajouter l'ID de l'utilisateur depuis le token
    createLandDto.ownerId = user.userId;

    // Mapper les fichiers uploadés
    if (files?.documents) {
      createLandDto.ipfsCIDs = files.documents.map(file => file.path);
    }
    if (files?.images) {
      createLandDto.imageCIDs = files.images.map(file => file.path);
    }

    return this.landService.create(createLandDto, user.ethAddress);
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
