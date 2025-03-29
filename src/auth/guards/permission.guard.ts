import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, RequiredPermission } from '../decorators/require-permissions.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.get<RequiredPermission>(
      PERMISSIONS_KEY,
      context.getHandler()
    );

    if (!requiredPermissions) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.permissions) {
      return false;
    }

    return this.matchPermissions(requiredPermissions, user.permissions);
  }

  private matchPermissions(required: RequiredPermission, userPermissions: any[]): boolean {
    const permission = userPermissions.find(p => p.resource === required.resource);
    if (!permission) return false;

    return required.actions.every(action => 
      permission.actions.includes(action)
    );
  }
}