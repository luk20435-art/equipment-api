import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_PAGE_KEY } from './require-page.decorator';
import { PermissionsService } from '../permissions/permissions.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const page = this.reflector.getAllAndOverride<string>(REQUIRE_PAGE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!page) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;

    const allowed = await this.permissionsService.hasAccess(user.role, page);
    if (!allowed) throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึง');
    return true;
  }
}
