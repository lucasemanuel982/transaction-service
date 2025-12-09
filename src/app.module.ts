import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MessagingModule } from './messaging/messaging.module';
import { EventPublisherService } from './messaging/event-publisher.service';
import { EventConsumerService } from './messaging/event-consumer.service';

@Module({
  imports: [MessagingModule],
  controllers: [AppController],
  providers: [AppService, EventPublisherService, EventConsumerService],
})
export class AppModule {}
