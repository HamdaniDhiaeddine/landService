import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { AuthService } from './auth.service';


@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @MessagePattern('authenticate')
  async authenticate(data: { Authentication: string }) {
    try {
      const user = await this.authService.validateToken(data.Authentication);
      return {
        success: true,
        data: user,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}