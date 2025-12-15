import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface JwtPayload {
  sub: string; // userId
  email: string;
  role?: string; // User role (user, admin, manager)
  jti?: string; // JWT ID
  iat?: number;
  exp?: number;
}

/**
 * Serviço JWT para validação de tokens no Transaction Service
 */
@Injectable()
export class TransactionJwtService {
  private readonly accessTokenSecret: string;

  constructor(private readonly jwtService: JwtService) {
    this.accessTokenSecret = process.env.JWT_SECRET || '';
  }

  /**
   * Verifica e decodifica access token
   */
  async verifyAccessToken(token: string): Promise<JwtPayload> {
    try {
      const payload = (await this.jwtService.verifyAsync(token, {
        secret: this.accessTokenSecret,
      })) as unknown as JwtPayload;

      return payload;
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }
  }
}
