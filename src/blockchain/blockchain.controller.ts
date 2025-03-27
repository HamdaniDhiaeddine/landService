import { Body, Controller, Get, Param, Post, HttpException, HttpStatus } from '@nestjs/common';
import { BlockchainService } from './services/blockchain.service';


// DTOs pour la validation des données
class RegisterLandDto {
  location: string;
  surface: number;
  totalTokens: number;
  pricePerToken: string;
  cid: string;
}

class MintTokenDto {
  landId: number;
  value: string;
}

class TransferTokenDto {
  to: string;
  tokenId: number;
}

class ListTokenDto {
  tokenId: number;
  price: string;
}

@Controller('land')
export class LandController {
  constructor(private readonly blockchainService: BlockchainService) {}

  @Post('register')
  async registerLand(@Body() registerLandDto: RegisterLandDto) {
    try {
      const tx = await this.blockchainService.registerLand(
        registerLandDto.location,
        registerLandDto.surface,
        registerLandDto.totalTokens,
        registerLandDto.pricePerToken,
        registerLandDto.cid
      );
      return {
        success: true,
        transactionHash: tx.hash,
        blockNumber: tx.blockNumber
      };
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: `Failed to register land: ${error.message}`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get(':id')
  async getLandDetails(@Param('id') id: string) {
    try {
      const land = await this.blockchainService.getLandDetails(Number(id));
      return {
        success: true,
        data: land
      };
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.NOT_FOUND,
          error: `Land not found: ${error.message}`,
        },
        HttpStatus.NOT_FOUND,
      );
    }
  }

  @Post('mint')
  async mintToken(@Body() mintTokenDto: MintTokenDto) {
    try {
      const tx = await this.blockchainService.mintToken(
        mintTokenDto.landId,
        mintTokenDto.value
      );
      return {
        success: true,
        transactionHash: tx.hash,
        blockNumber: tx.blockNumber
      };
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: `Failed to mint token: ${error.message}`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('transfer')
  async transferToken(@Body() transferTokenDto: TransferTokenDto) {
    try {
      const tx = await this.blockchainService.transferToken(
        transferTokenDto.to,
        transferTokenDto.tokenId
      );
      return {
        success: true,
        transactionHash: tx.hash,
        blockNumber: tx.blockNumber
      };
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: `Failed to transfer token: ${error.message}`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('market/list')
  async listToken(@Body() listTokenDto: ListTokenDto) {
    try {
      const tx = await this.blockchainService.listToken(
        listTokenDto.tokenId,
        listTokenDto.price
      );
      return {
        success: true,
        transactionHash: tx.hash,
        blockNumber: tx.blockNumber
      };
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: `Failed to list token: ${error.message}`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('market/buy/:tokenId')
  async buyToken(@Param('tokenId') tokenId: string) {
    try {
      const tx = await this.blockchainService.buyToken(Number(tokenId));
      return {
        success: true,
        transactionHash: tx.hash,
        blockNumber: tx.blockNumber
      };
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: `Failed to buy token: ${error.message}`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}