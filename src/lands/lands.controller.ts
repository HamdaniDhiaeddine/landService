import { Controller, Get, Post, Body, Patch, Param, Delete, UseInterceptors, UploadedFiles, Res, UseGuards, Req, BadRequestException, HttpException, HttpStatus, ValidationPipe } from '@nestjs/common';
import { CreateLandDto } from './dto/create-land.dto';
import { UpdateLandDto } from './dto/update-land.dto';
import { LandService } from './lands.service';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { PermissionGuard } from 'src/auth/guards/permission.guard';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { Resource } from 'src/auth/enums/resource.enum';
import { Action } from 'src/auth/enums/action.enum';
import { JWTPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { Logger } from '@nestjs/common';
import { RelayerService } from 'src/blockchain/services/relayer.service';
import { ValidateLandDto } from './dto/validate-land.dto';
import { BlockchainService } from 'src/blockchain/services/blockchain.service';


@Controller('lands')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class LandController {
  private readonly logger = new Logger(LandController.name);
  constructor(
    private readonly landService: LandService,
    private readonly relayerService: RelayerService,
    private readonly blockchainService: BlockchainService
  ) { }

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
  /*@RequirePermissions({
    resource: Resource.LAND,
    actions: [Action.VIEW_OWN_LANDS]
  })*/
  async getAllLands() {
    return this.blockchainService.getAllLands();
  }

  @Get(':id')
  async getLandDetails(@Param('id') id: string) {
    try {
      const landId = parseInt(id);
      if (isNaN(landId) || landId <= 0) {
        throw new HttpException('Invalid land ID', HttpStatus.BAD_REQUEST);
      }

      const result = await this.blockchainService.getLandDetails(landId);
      return {
        ...result,
        timestamp: new Date().toISOString(),
        requestedBy: 'dalikhouaja008'
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error.message.includes('not found')) {
        throw new HttpException(error.message, HttpStatus.NOT_FOUND);
      }
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
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



  @Get('blockchain/all')
  async getAllLandsFromBlockchain() {
    try {
      const lands = await this.landService.getAllLandsFromBlockchain();
      return {
        success: true,
        data: lands,
        message: 'Lands retrieved successfully from blockchain'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to retrieve lands from blockchain'
      };
    }
  }

  @Post('tokens/mint')
  async mintToken(
    @Body('landId') landId: number,
    @Body('value') value: string
  ) {
    try {
      const result = await this.blockchainService.mintToken(landId, value);
      return {
        success: true,
        data: {
          transactionHash: result.hash,
          blockNumber: result.blockNumber
        },
        message: 'Token minted successfully'
      };
    } catch (error) {
      throw new HttpException(
        error.message,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('tokens/transfer')
  async transferToken(
    @Body('to') to: string,
    @Body('tokenId') tokenId: number
  ) {
    try {
      const result = await this.blockchainService.transferToken(to, tokenId);
      return {
        success: true,
        data: {
          transactionHash: result.hash,
          blockNumber: result.blockNumber
        },
        message: 'Token transferred successfully'
      };
    } catch (error) {
      throw new HttpException(
        error.message,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /*@Post('marketplace/list')
  async listToken(@Body(ValidationPipe) tokenData: TokenOperationDto) {
    try {
      const result = await this.blockchainService.listToken(
        tokenData.tokenId,
        tokenData.price
      );
      return {
        success: true,
        data: {
          transactionHash: result.hash,
          blockNumber: result.blockNumber
        },
        message: 'Token listed successfully'
      };
    } catch (error) {
      throw new HttpException(
        error.message,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }*/

  @Post('marketplace/buy')
  async buyToken(@Body('tokenId') tokenId: number) {
    try {
      const result = await this.blockchainService.buyToken(tokenId);
      return {
        success: true,
        data: {
          transactionHash: result.hash,
          blockNumber: result.blockNumber
        },
        message: 'Token bought successfully'
      };
    } catch (error) {
      throw new HttpException(
        error.message,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('verify-transaction/:hash')
  async verifyTransaction(@Param('hash') hash: string) {
    return await this.blockchainService.verifyTransactionDetails(hash);
  }

  @Get('verify-land/:id')
  async verifyLand(@Param('id') id: string) {
    return await this.blockchainService.verifyLand(Number(id));
  }
}
