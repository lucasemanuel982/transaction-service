import { Module } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MessagingModule } from './messaging/messaging.module';
import { EventPublisherService } from './messaging/event-publisher.service';
import { EventConsumerService } from './messaging/event-consumer.service';
import { SecurityModule } from './security/security.module';
import { DatabaseModule } from './database/database.module';
import { TransactionsModule } from './transactions/transactions.module';

@Module({
  imports: [
    DatabaseModule,
    MessagingModule,
    SecurityModule,
    TransactionsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    EventPublisherService,
    EventConsumerService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
