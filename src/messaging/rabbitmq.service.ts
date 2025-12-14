import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import * as amqp from 'amqplib';
import { RABBITMQ_CONFIG } from './rabbitmq.config';

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;
  private readonly connectionUrl: string;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private reconnectDelay = 1000; // 1 segundo inicial

  constructor() {
    this.connectionUrl =
      process.env.RABBITMQ_URL || 'amqp://admin:admin123@localhost:5672/';
  }

  async onModuleInit() {
    await this.connect();
    await this.setupExchangeAndQueues();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  /**
   * Conecta ao RabbitMQ com retry automático
   */
  private async connect(): Promise<void> {
    try {
      this.logger.log('Conectando ao RabbitMQ...');
      const connectionResult = await amqp.connect(this.connectionUrl);
      this.connection = connectionResult as unknown as amqp.Connection;
      if (!this.connection) {
        throw new Error('Falha ao estabelecer conexão com RabbitMQ');
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      this.channel = await (this.connection as any).createChannel();
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;

      // Tratamento de erros de conexão
      this.connection.on('error', (err) => {
        this.logger.error('Erro na conexão RabbitMQ:', err);
        void this.handleConnectionError();
      });

      this.connection.on('close', () => {
        this.logger.warn('Conexão RabbitMQ fechada');
        void this.handleConnectionError();
      });

      this.logger.log('Conectado ao RabbitMQ com sucesso');
    } catch (error) {
      this.logger.error('Falha ao conectar ao RabbitMQ:', error);
      await this.handleConnectionError();
      throw error;
    }
  }

  /**
   * Trata erros de conexão e tenta reconectar
   */
  private async handleConnectionError(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error(
        `Máximo de tentativas de reconexão atingido (${this.maxReconnectAttempts})`,
      );
      return;
    }

    this.reconnectAttempts++;
    this.logger.warn(
      `Tentativa de reconexão ${this.reconnectAttempts}/${this.maxReconnectAttempts} em ${this.reconnectDelay}ms`,
    );

    await this.disconnect();

    setTimeout(() => {
      void (async () => {
        try {
          await this.connect();
          await this.setupExchangeAndQueues();
        } catch (error) {
          this.logger.error('Falha na reconexão:', error);
          this.reconnectDelay = Math.min(
            this.reconnectDelay * 2,
            30000, // Máximo de 30 segundos
          );
          await this.handleConnectionError();
        }
      })();
    }, this.reconnectDelay);
  }

  /**
   * Configura exchange e queues
   */
  private async setupExchangeAndQueues(): Promise<void> {
    if (!this.channel) {
      throw new Error('Canal não está disponível');
    }

    try {
      // Cria exchange
      await this.channel.assertExchange(
        RABBITMQ_CONFIG.EXCHANGE.NAME,
        RABBITMQ_CONFIG.EXCHANGE.TYPE,
        RABBITMQ_CONFIG.EXCHANGE.OPTIONS,
      );
      this.logger.log(
        `Exchange '${RABBITMQ_CONFIG.EXCHANGE.NAME}' configurado`,
      );

      // Cria queues para eventos de transação
      await this.channel.assertQueue(
        RABBITMQ_CONFIG.QUEUES.TRANSACTION_COMPLETED,
        { durable: true },
      );

      await this.channel.assertQueue(
        RABBITMQ_CONFIG.QUEUES.TRANSACTION_FAILED,
        { durable: true },
      );

      // Cria queue para eventos de atualização de dados bancários (para consumo)
      await this.channel.assertQueue(
        RABBITMQ_CONFIG.QUEUES.BANKING_DETAILS_UPDATED,
        { durable: true },
      );

      // Bind queues ao exchange
      await this.channel.bindQueue(
        RABBITMQ_CONFIG.QUEUES.TRANSACTION_COMPLETED,
        RABBITMQ_CONFIG.EXCHANGE.NAME,
        RABBITMQ_CONFIG.ROUTING_KEYS.TRANSACTION_COMPLETED,
      );

      await this.channel.bindQueue(
        RABBITMQ_CONFIG.QUEUES.TRANSACTION_FAILED,
        RABBITMQ_CONFIG.EXCHANGE.NAME,
        RABBITMQ_CONFIG.ROUTING_KEYS.TRANSACTION_FAILED,
      );

      await this.channel.bindQueue(
        RABBITMQ_CONFIG.QUEUES.BANKING_DETAILS_UPDATED,
        RABBITMQ_CONFIG.EXCHANGE.NAME,
        RABBITMQ_CONFIG.ROUTING_KEYS.BANKING_DETAILS_UPDATED,
      );

      this.logger.log('Queues configuradas com sucesso');
    } catch (error) {
      this.logger.error('Erro ao configurar exchange/queues:', error);
      throw error;
    }
  }

  /**
   * Publica um evento no RabbitMQ
   */
  publishEvent<T>(routingKey: string, event: T): boolean {
    if (!this.channel) {
      throw new Error('Canal não está disponível. RabbitMQ não conectado.');
    }

    try {
      const message = Buffer.from(JSON.stringify(event));
      const published = this.channel.publish(
        RABBITMQ_CONFIG.EXCHANGE.NAME,
        routingKey,
        message,
        RABBITMQ_CONFIG.PUBLISH_OPTIONS,
      );

      if (published) {
        this.logger.debug(
          `Evento publicado: ${routingKey}`,
          JSON.stringify(event),
        );
      } else {
        this.logger.warn(
          `Falha ao publicar evento: ${routingKey}. Buffer pode estar cheio.`,
        );
      }

      return published;
    } catch (error) {
      this.logger.error(`Erro ao publicar evento ${routingKey}:`, error);
      throw error;
    }
  }

  /**
   * Consome mensagens de uma queue
   */
  async consumeQueue<T>(
    queueName: string,
    onMessage: (message: T) => Promise<void>,
  ): Promise<void> {
    if (!this.channel) {
      throw new Error('Canal não está disponível. RabbitMQ não conectado.');
    }

    try {
      await this.channel.consume(
        queueName,
        (msg) => {
          if (!msg) {
            return;
          }

          void (async () => {
            try {
              let content: T;
              try {
                content = JSON.parse(msg.content.toString()) as T;
              } catch (parseError) {
                this.logger.error(
                  `Erro ao fazer parse da mensagem da queue ${queueName}:`,
                  parseError,
                );
                this.channel?.nack(msg, false, false);
                return;
              }

              const timeout = 30000; // 30 segundos
              const timeoutPromise = new Promise<void>((_, reject) => {
                setTimeout(
                  () => reject(new Error('Timeout ao processar mensagem')),
                  timeout,
                );
              });

              await Promise.race([onMessage(content), timeoutPromise]);

              this.channel?.ack(msg);
              this.logger.debug(
                `Mensagem processada com sucesso da queue ${queueName}`,
              );
            } catch (error) {
              this.logger.error(
                `Erro ao processar mensagem da queue ${queueName}:`,
                error,
              );
              this.channel?.nack(msg, false, false);
            }
          })();
        },
        RABBITMQ_CONFIG.CONSUME_OPTIONS,
      );

      this.logger.log(`Consumindo mensagens da queue: ${queueName}`);
    } catch (error) {
      this.logger.error(`Erro ao consumir queue ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Verifica se está conectado
   */
  isConnected(): boolean {
    return this.connection !== null && this.channel !== null;
  }

  /**
   * Desconecta do RabbitMQ
   */
  private async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        (this.connection as any).close?.();
        this.connection = null;
      }
      this.logger.log('Desconectado do RabbitMQ');
    } catch (error) {
      this.logger.error('Erro ao desconectar do RabbitMQ:', error);
    }
  }
}
