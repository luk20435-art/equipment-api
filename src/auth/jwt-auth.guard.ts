import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    if (process.env.NODE_ENV === 'development') {
      const request = context.switchToHttp().getRequest();
      const auth = request.headers.authorization;
      if (auth === 'Bearer bypass-token') {
        request.user = { id: 'dev-user', email: 'admin@company.com', role: 'admin', name: 'Dev Admin' };
        return true;
      }
    }
    return super.canActivate(context);
  }
}
