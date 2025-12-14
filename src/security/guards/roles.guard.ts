import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role?: string;
    jti?: string;
  };
}

/**
 * Verifica se o usuário autenticado possui uma das permissões necessárias
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user: AuthenticatedRequest['user'] = request.user;
    if (!user) {
      throw new ForbiddenException(
        'Usuário não autenticado ou informações de usuário não encontradas',
      );
    }

    const userRole = user.role;

    if (!userRole) {
      throw new ForbiddenException(
        'Usuário não possui role definida. Acesso negado.',
      );
    }

    const hasRole = requiredRoles.some((role) => role === userRole);

    if (!hasRole) {
      throw new ForbiddenException(
        `Acesso negado. Role requerida: ${requiredRoles.join(', ')}. Role do usuário: ${userRole}`,
      );
    }

    return true;
  }
}
