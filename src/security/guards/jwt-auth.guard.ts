import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Guard base para autenticação JWT
 * Será implementado completamente no Card 22
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // TODO: Implementar validação de JWT no Card 22
    // Por enquanto, permite todas as requisições
    return true;
  }
}

