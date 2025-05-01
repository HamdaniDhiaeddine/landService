import { Controller, Get, Post, Body, Patch, Param, Delete, UseInterceptors, UploadedFiles, Res, UseGuards, Req, BadRequestException, HttpException, HttpStatus, ValidationPipe, InternalServerErrorException } from '@nestjs/common';
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
import { ValidationRequest, ValidationResponse } from 'src/blockchain/interfaces/validation.interface';
import { ethers } from 'ethers';
import multer from 'multer';
import { EnhancedLandResult } from './interfaces/enhanced-land.interface';


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
  /*@RequirePermissions({
     resource: Resource.LAND,
     actions: ['upload_land']
   })*/
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'documents', maxCount: 5 },
      { name: 'images', maxCount: 10 }
    ])
  )
  async create(
    @Body() createLandDto: CreateLandDto,
    @UploadedFiles() files: { documents?: Express.Multer.File[], images?: Express.Multer.File[] },
    @Req() req: Request
  ) {
    try {
      const user = (req as any).user as JWTPayload;
      const body = req.body as any;

      // Au début de votre méthode create, ajoutez:
      console.log('=============== DEBUG COMPLET ===============');
      console.log('Headers:', JSON.stringify((req as any).headers));
      console.log('Files object exists:', !!files);
      console.log('Files object content:', JSON.stringify({
        hasDocuments: !!files?.documents,
        hasImages: !!files?.images,
        documentsCount: files?.documents?.length || 0,
        imagesCount: files?.images?.length || 0
      }));
      console.log('Request body keys:', Object.keys(req.body));
      console.log('============================================');

      if (files?.documents) {
        files.documents.forEach((doc, i) => {
          this.logger.debug(`Document ${i}: ${doc.originalname}, size: ${doc.size}, mime: ${doc.mimetype}`);
        });
      }
      if (files?.images) {
        files.images.forEach((img, i) => {
          this.logger.debug(`Image ${i}: ${img.originalname}, size: ${img.size}, mime: ${img.mimetype}`);
        });
      }
      this.logger.debug('=============================');

      console.log('\n====== JWT Payload Details ======');
      console.log('Current Date and Time (UTC):', new Date().toISOString());
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

      // Ajouter l'ID de l'utilisateur depuis le token
      createLandDto.ownerId = user.userId;

      // Initialiser fileBuffers si ce n'est pas déjà fait
      if (!createLandDto.fileBuffers) {
        createLandDto.fileBuffers = {
          documents: [],
          images: []
        };
      }

      console.log('\n====== Fichiers reçus ======');

      if (files?.documents && files.documents.length > 0) {
        console.log(`Documents reçus: ${files.documents.length}`);

        files.documents.forEach((file, index) => {
          console.log(`Document ${index + 1}:`, {
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            buffer: file.buffer ? `Buffer disponible (${file.buffer.length} bytes)` : 'Buffer non disponible'
          });

          // Stocker les buffers directement
          if (file.buffer) {
            createLandDto.fileBuffers.documents.push({
              buffer: file.buffer,
              originalname: file.originalname,
              mimetype: file.mimetype
            });
          }
        });

        console.log(`Buffers de documents stockés: ${createLandDto.fileBuffers.documents.length}`);
      } else {
        console.log('Aucun document reçu');
      }

      if (files?.images && files.images.length > 0) {
        console.log(`Images reçues: ${files.images.length}`);

        files.images.forEach((file, index) => {
          console.log(`Image ${index + 1}:`, {
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            buffer: file.buffer ? `Buffer disponible (${file.buffer.length} bytes)` : 'Buffer non disponible'
          });

          // Stocker les buffers directement
          if (file.buffer) {
            createLandDto.fileBuffers.images.push({
              buffer: file.buffer,
              originalname: file.originalname,
              mimetype: file.mimetype
            });
          }
        });

        console.log(`Buffers d'images stockés: ${createLandDto.fileBuffers.images.length}`);
      } else {
        console.log('Aucune image reçue');
      }
      console.log('=============================\n');

      // Extraire et construire l'objet amenities à partir des champs individuels du formulaire
      const amenities: Record<string, boolean> = {};
      const amenityFields = [
        'electricity', 'gas', 'water', 'sewer', 'headquarters', 'internet',
        'geotechnicalSurvey', 'soilAnalysis', 'topographicalSurvey', 'environmentalStudy',
        'roadAccess', 'publicTransport', 'pavedRoad', 'buildingPermit', 'zoned',
        'boundaryMarkers', 'drainage', 'floodRisk', 'rainwaterCollection',
        'fenced', 'securitySystem', 'trees', 'wellWater', 'flatTerrain'
      ];

      amenityFields.forEach(field => {
        if (field in body) {
          // Convertir les chaînes 'true'/'false' en booléens
          amenities[field] = body[field] === 'true' || body[field] === true;
        }
      });

      // Ajouter les amenities à l'objet createLandDto
      createLandDto.amenities = amenities;

      // CORRECTION: Convertir les valeurs d'énumération en minuscules pour conformité avec le schéma Mongoose
      createLandDto.status = createLandDto.status?.toLowerCase();
      createLandDto.landtype = createLandDto.landtype?.toLowerCase();

      console.log('✅ Land creation request prepared:', {
        title: createLandDto.title,
        location: createLandDto.location,
        surface: createLandDto.surface,
        status: createLandDto.status,
        landtype: createLandDto.landtype,
        documentsCount: createLandDto.fileBuffers.documents.length,
        imagesCount: createLandDto.fileBuffers.images.length,
        amenitiesCount: Object.keys(amenities).length
      });

      return this.landService.create(createLandDto, user.ethAddress);
    } catch (error) {
      console.error('❌ Error in create land endpoint:', {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
        user: 'nesssim'
      });

      if (error.response) {
        throw error;
      }
      throw new InternalServerErrorException(`Failed to create land: ${error.message}`);
    }
  }




  @Get('without-role-validation')
  /*@RequirePermissions({
    resource: Resource.LAND,
    actions: ['view_land']
  })*/
  async getLandsWithoutRoleValidation(@Req() req: Request) {
    try {
      const user = (req as any).user as JWTPayload;
      console.log('\n====== User Auth Details ======');
      console.log('Current Date and Time (UTC):', new Date().toISOString());
      console.log('User ID:', user.userId);
      console.log('Email:', user.email);
      console.log('Role:', user.role);
      console.log('Ethereum Address:', user.ethAddress || 'Not available');
      console.log('=============================\n');

      // Utiliser le rôle de l'utilisateur pour filtrer les terrains
      const lands: EnhancedLandResult[] = await this.landService.findLandsWithoutRoleValidation(user.role);

      console.log(`✅ Retrieved ${lands.length} lands without ${user.role} validation.`);

      return {
        success: true,
        data: lands,
        message: `Retrieved ${lands.length} lands without ${user.role} validation`,
      };
    } catch (error) {
      console.error('❌ Error getting lands without role validation:', {
        message: error.message,
        stack: error.stack,
      });

      throw new InternalServerErrorException(`Failed to get lands without role validation: ${error.message}`);
    }
  }
  /**
  * Récupère tous les terrains disponibles
  */
  @Get('catalogue')
  async findAllLands(): Promise<EnhancedLandResult[]> {
    this.logger.log('Endpoint: GET /lands - Récupération de tous les terrains');
    return this.landService.findAllLands();
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
  @Get('blockchain-status')
  async getBlockchainStatus() {
    try {
      const provider = this.blockchainService.getProvider();
      const network = await provider.getNetwork();
      const blockNumber = await provider.getBlockNumber();
      const relayerAddress = await this.relayerService.getRelayerAddress();
      const balance = await provider.getBalance(relayerAddress);

      return {
        success: true,
        data: {
          network: {
            name: network.name,
            chainId: network.chainId
          },
          blockNumber,
          relayer: {
            address: relayerAddress,
            balance: ethers.formatEther(balance)
          },
          contracts: {
            landRegistry: this.blockchainService.getLandRegistry().target
          }
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
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
  @Post('validate')
  /* @RequirePermissions({
     resource: Resource.LAND,
     actions: ['validate_land']
   })*/
  async validateLand(
    @Body() validateRequest: ValidationRequest,
    @Req() req: Request
  ): Promise<ValidationResponse> {
    const user = (req as any).user as JWTPayload;

    if (!user.ethAddress) {
      throw new BadRequestException('Ethereum address is required to validate land');
    }

    return this.landService.validateLand(validateRequest, user);
  }

  @Post('tokenize/:id')
  @UseGuards(JwtAuthGuard)
  async tokenizeLand(@Param('id') id: string) {
    try {
      const landId = Number(id);
      if (isNaN(landId) || landId <= 0) {
        throw new BadRequestException('Invalid land ID. Must be a positive number.');
      }
      
      return await this.landService.tokenizeLandById(landId);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new HttpException(
        `Failed to tokenize land: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
  
}
