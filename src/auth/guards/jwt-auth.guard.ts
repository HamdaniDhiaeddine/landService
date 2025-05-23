import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { JWTPayload } from '../interfaces/jwt-payload.interface';

interface RequestWithUser extends Request {
  user?: JWTPayload;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractTokenFromHeader(req);

    if (!token) {
      throw new UnauthorizedException('Token manquant');
    }

    try {
      const payload = this.jwtService.verify<JWTPayload>(token, {
        secret: process.env.JWT_SECRET
      });

      // Vérification 2FA si nécessaire
     /* if (payload.isTwoFactorAuthenticated === true) {
        throw new UnauthorizedException('Authentification à deux facteurs requise');
      }*/

      // Stocker les informations utilisateur complètes dans la requête
      req.user = payload;

      // Log pour le debugging
      console.log(`
      [${new Date().toISOString()}] Accès autorisé :
      User ID: ${payload.userId}
      Email: ${payload.email}
      Role: ${payload.role}
      Permissions:
      ${payload.permissions?.map(p => `  - ${p.resource}: [${p.actions.join(', ')}]`).join('\n')}
      `);

      return true;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Erreur d'authentification:`, error.message);
      throw new UnauthorizedException('Token invalide ou expiré');
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}