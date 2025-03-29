import { SetMetadata } from '@nestjs/common';

export interface RequiredPermission {
  resource: string;
  actions: string[];
}

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (permissions: RequiredPermission) => 
  SetMetadata(PERMISSIONS_KEY, permissions);