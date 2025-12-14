import { Module, Global } from '@nestjs/common';
import { RabbitMQService } from './rabbitmq.service';
import { EventPublisherService } from './event-publisher.service';

@Global()
@Module({
  providers: [RabbitMQService, EventPublisherService],
  exports: [RabbitMQService, EventPublisherService],
})
export class MessagingModule {}
