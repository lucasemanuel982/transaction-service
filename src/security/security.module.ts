import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { JwtModule } from '@nestjs/jwt';
import { TransactionJwtService } from './services/jwt.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minuto
        limit: 100, // 100 requisições por minuto
      },
    ]),
    JwtModule.register({
      global: false,
      secret: process.env.JWT_SECRET,
    }),
  ],
  providers: [TransactionJwtService, JwtAuthGuard],
  exports: [ThrottlerModule, TransactionJwtService, JwtAuthGuard],
})
export class SecurityModule {}
