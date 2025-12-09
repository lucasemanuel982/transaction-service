import { Injectable, Logger } from '@nestjs/common';
import { RabbitMQService } from './rabbitmq.service';
import { RABBITMQ_CONFIG } from './rabbitmq.config';
import {
  TransactionCompletedEvent,
  TransactionFailedEvent,
} from './interfaces/events.interface';
import { randomUUID } from 'crypto';

@Injectable()
export class EventPublisherService {
  private readonly logger = new Logger(EventPublisherService.name);

  constructor(private readonly rabbitMQService: RabbitMQService) {}

  /**
   * Publica evento de transação concluída
   */
  async publishTransactionCompleted(
    transactionId: string,
    senderUserId: string,
    receiverUserId: string,
    amount: number,
  ): Promise<void> {
    if (!this.rabbitMQService.isConnected()) {
      this.logger.warn('RabbitMQ não conectado. Evento não será publicado.');
      return;
    }

    const event: TransactionCompletedEvent = {
      eventId: randomUUID(),
      transactionId,
      senderUserId,
      receiverUserId,
      amount,
      timestamp: new Date().toISOString(),
      source: 'transaction-service',
    };

    try {
      await this.rabbitMQService.publishEvent(
        RABBITMQ_CONFIG.ROUTING_KEYS.TRANSACTION_COMPLETED,
        event,
      );
      this.logger.log(
        `Evento 'transaction.completed' publicado para transação ${transactionId}`,
      );
    } catch (error) {
      this.logger.error(
        'Erro ao publicar evento transaction.completed:',
        error,
      );
      throw error;
    }
  }

  /**
   * Publica evento de transação falhada
   */
  async publishTransactionFailed(
    transactionId: string,
    reason: string,
  ): Promise<void> {
    if (!this.rabbitMQService.isConnected()) {
      this.logger.warn('RabbitMQ não conectado. Evento não será publicado.');
      return;
    }

    const event: TransactionFailedEvent = {
      eventId: randomUUID(),
      transactionId,
      reason,
      timestamp: new Date().toISOString(),
      source: 'transaction-service',
    };

    try {
      await this.rabbitMQService.publishEvent(
        RABBITMQ_CONFIG.ROUTING_KEYS.TRANSACTION_FAILED,
        event,
      );
      this.logger.log(
        `Evento 'transaction.failed' publicado para transação ${transactionId}`,
      );
    } catch (error) {
      this.logger.error('Erro ao publicar evento transaction.failed:', error);
      throw error;
    }
  }
}
