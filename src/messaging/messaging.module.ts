import { Module, Global } from '@nestjs/common';
import { RabbitMQService } from './rabbitmq.service';
import { EventPublisherService } from './event-publisher.service';
import { EventValidatorService } from './event-validator.service';
import { EventConsumerService } from './event-consumer.service';

@Global()
@Module({
  providers: [
    RabbitMQService,
    EventPublisherService,
    EventValidatorService,
    EventConsumerService,
  ],
  exports: [
    RabbitMQService,
    EventPublisherService,
    EventValidatorService,
    EventConsumerService,
  ],
})
export class MessagingModule {}
