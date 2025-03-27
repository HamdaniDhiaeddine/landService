import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { firstValueFrom } from "rxjs";
import { SERVICES } from "src/constants/service";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(SERVICES.USER_AUTH) 
    private userManagementClient: ClientProxy
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException();
    }

    try {
      // Vérifie le token avec UserManagement
      const user = await firstValueFrom(
        this.userManagementClient.send('authenticate', { token })
      );
      
      // Stocke les infos user pour utilisation dans les controllers
      request.user = user;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }

  private extractToken(request: any): string | undefined {
    return request.headers.authorization?.split(' ')[1];
  }
}