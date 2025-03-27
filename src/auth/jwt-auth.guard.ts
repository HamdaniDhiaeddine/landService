import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

// Define a type for Request to include user
interface RequestWithUser extends Request {
  user?: { userId: string };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) throw new UnauthorizedException('No token provided');

    try {
      const decoded = this.jwtService.verify(token, { secret: process.env.JWT_SECRET });
      if (!decoded || !decoded.sub) throw new UnauthorizedException('Invalid token payload');

      req.user = { userId: decoded.sub }; // Store only userId in req.user
      return true;
    } catch (err) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
