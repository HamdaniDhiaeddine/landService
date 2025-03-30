import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.get<{ resource: string; actions: string[] }>(
      'permissions',
      context.getHandler()
    );

    if (!requiredPermissions) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    this.logger.debug('Required Permissions:', requiredPermissions);
    this.logger.debug('User Permissions:', user.permissions);

    const hasPermission = user.permissions?.some(permission => 
      permission.resource === requiredPermissions.resource &&
      permission.actions.some(action => 
        requiredPermissions.actions.includes(action)
      )
    );

    if (!hasPermission) {
      this.logger.warn(`Permission denied for user ${user.email}. Required: `, {
        required: requiredPermissions,
        userHas: user.permissions
      });
    }

    return hasPermission;
  }
}