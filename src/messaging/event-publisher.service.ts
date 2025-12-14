import { Injectable, Logger } from '@nestjs/common';
import { RabbitMQService } from './rabbitmq.service';
import { EventValidatorService } from './event-validator.service';
import { RABBITMQ_CONFIG } from './rabbitmq.config';
import {
  TransactionCompletedEvent,
  TransactionFailedEvent,
} from './interfaces/events.interface';
import { randomUUID } from 'crypto';

@Injectable()
export class EventPublisherService {
  private readonly logger = new Logger(EventPublisherService.name);

  constructor(
    private readonly rabbitMQService: RabbitMQService,
    private readonly eventValidator: EventValidatorService,
  ) {}

  /**
   * Publica evento de transação concluída
   */
  publishTransactionCompleted(
    transactionId: string,
    senderUserId: string,
    receiverUserId: string,
    amount: number,
  ): void {
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

    if (!this.eventValidator.validateTransactionCompleted(event)) {
      const error = new Error(
        'Evento transaction.completed inválido. Não será publicado.',
      );
      this.logger.error(error.message, event);
      throw error;
    }

    try {
      const published = this.rabbitMQService.publishEvent(
        RABBITMQ_CONFIG.ROUTING_KEYS.TRANSACTION_COMPLETED,
        event,
      );
      if (published) {
        this.logger.log(
          `Evento 'transaction.completed' publicado para transação ${transactionId}`,
        );
      } else {
        throw new Error(
          'Falha ao publicar evento transaction.completed. Buffer pode estar cheio.',
        );
      }
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
  publishTransactionFailed(transactionId: string, reason: string): void {
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

    if (!this.eventValidator.validateTransactionFailed(event)) {
      const error = new Error(
        'Evento transaction.failed inválido. Não será publicado.',
      );
      this.logger.error(error.message, event);
      throw error;
    }

    try {
      const published = this.rabbitMQService.publishEvent(
        RABBITMQ_CONFIG.ROUTING_KEYS.TRANSACTION_FAILED,
        event,
      );
      if (published) {
        this.logger.log(
          `Evento 'transaction.failed' publicado para transação ${transactionId}`,
        );
      } else {
        throw new Error(
          'Falha ao publicar evento transaction.failed. Buffer pode estar cheio.',
        );
      }
    } catch (error) {
      this.logger.error('Erro ao publicar evento transaction.failed:', error);
      throw error;
    }
  }
}
