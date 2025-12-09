import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitMQService } from './rabbitmq.service';
import { RABBITMQ_CONFIG } from './rabbitmq.config';
import { BankingDetailsUpdatedEvent } from './interfaces/events.interface';

@Injectable()
export class EventConsumerService implements OnModuleInit {
  private readonly logger = new Logger(EventConsumerService.name);

  constructor(private readonly rabbitMQService: RabbitMQService) {}

  async onModuleInit() {
    // Aguarda um pouco para garantir que o RabbitMQ está pronto
    await new Promise((resolve) => {
      setTimeout(() => {
        void this.startConsumingBankingDetailsUpdated();
        resolve(undefined);
      }, 2000);
    });
  }

  /**
   * Inicia consumo de eventos de atualização de dados bancários
   */
  private async startConsumingBankingDetailsUpdated(): Promise<void> {
    if (!this.rabbitMQService.isConnected()) {
      this.logger.warn(
        'RabbitMQ não conectado. Consumo de eventos não será iniciado.',
      );
      return;
    }

    try {
      await this.rabbitMQService.consumeQueue<BankingDetailsUpdatedEvent>(
        RABBITMQ_CONFIG.QUEUES.BANKING_DETAILS_UPDATED,
        (event) => {
          this.handleBankingDetailsUpdated(event);
          return Promise.resolve();
        },
      );
    } catch (error) {
      this.logger.error(
        'Erro ao iniciar consumo de eventos banking-details.updated:',
        error,
      );
    }
  }

  /**
   * Processa evento de atualização de dados bancários
   */
  private handleBankingDetailsUpdated(event: BankingDetailsUpdatedEvent): void {
    this.logger.log(
      `Evento recebido: banking-details.updated para usuário ${event.userId}`,
    );

    try {
      // Será implementado posteriormente
      this.logger.debug('Evento processado com sucesso', event);
    } catch (error) {
      this.logger.error(
        'Erro ao processar evento banking-details.updated:',
        error,
      );
      throw error; // Rejeita a mensagem para retry
    }
  }
}
