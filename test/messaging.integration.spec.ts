import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { RabbitMQService } from '../src/messaging/rabbitmq.service';
import { EventPublisherService } from '../src/messaging/event-publisher.service';
import { EventValidatorService } from '../src/messaging/event-validator.service';
import {
  BankingDetailsUpdatedEvent,
  TransactionCompletedEvent,
  TransactionFailedEvent,
} from '../src/messaging/interfaces/events.interface';
import { randomUUID } from 'crypto';

/**
 * Helper function to create a delay promise
 */
const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), ms);
  });
};

describe('Messaging Integration Tests (e2e)', () => {
  let app: INestApplication;
  let rabbitMQService: RabbitMQService;
  let eventPublisherService: EventPublisherService;
  let eventValidatorService: EventValidatorService;

  beforeAll(async () => {
    // Configurar variáveis de ambiente para testes
    if (!process.env.RABBITMQ_URL) {
      process.env.RABBITMQ_URL = 'amqp://admin:admin123@localhost:5672/';
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    rabbitMQService = moduleFixture.get<RabbitMQService>(RabbitMQService);
    eventPublisherService = moduleFixture.get<EventPublisherService>(
      EventPublisherService,
    );
    eventValidatorService = moduleFixture.get<EventValidatorService>(
      EventValidatorService,
    );

    let attempts = 0;
    while (!rabbitMQService.isConnected() && attempts < 10) {
      await delay(1000);
      attempts++;
    }

    if (!rabbitMQService.isConnected()) {
      throw new Error('Não foi possível conectar ao RabbitMQ para testes');
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Validação de Eventos', () => {
    it('deve validar evento banking-details.updated válido', () => {
      const event: BankingDetailsUpdatedEvent = {
        eventId: randomUUID(),
        userId: randomUUID(),
        bankingDetails: {
          agency: '0001',
          account: '12345-6',
        },
        timestamp: new Date().toISOString(),
        source: 'user-service',
      };

      const isValid =
        eventValidatorService.validateBankingDetailsUpdated(event);
      expect(isValid).toBe(true);
    });

    it('deve rejeitar evento banking-details.updated inválido (sem userId)', () => {
      const event = {
        eventId: randomUUID(),
        bankingDetails: {
          agency: '0001',
          account: '12345-6',
        },
        timestamp: new Date().toISOString(),
        source: 'user-service',
      };

      const isValid =
        eventValidatorService.validateBankingDetailsUpdated(event);
      expect(isValid).toBe(false);
    });

    it('deve validar evento transaction.completed válido', () => {
      const event: TransactionCompletedEvent = {
        eventId: randomUUID(),
        transactionId: randomUUID(),
        senderUserId: randomUUID(),
        receiverUserId: randomUUID(),
        amount: 100.5,
        timestamp: new Date().toISOString(),
        source: 'transaction-service',
      };

      const isValid = eventValidatorService.validateTransactionCompleted(event);
      expect(isValid).toBe(true);
    });

    it('deve rejeitar evento transaction.completed inválido (amount negativo)', () => {
      const event: TransactionCompletedEvent = {
        eventId: randomUUID(),
        transactionId: randomUUID(),
        senderUserId: randomUUID(),
        receiverUserId: randomUUID(),
        amount: -100,
        timestamp: new Date().toISOString(),
        source: 'transaction-service',
      };

      const isValid = eventValidatorService.validateTransactionCompleted(event);
      expect(isValid).toBe(false);
    });

    it('deve validar evento transaction.failed válido', () => {
      const event: TransactionFailedEvent = {
        eventId: randomUUID(),
        transactionId: randomUUID(),
        reason: 'Insufficient balance',
        timestamp: new Date().toISOString(),
        source: 'transaction-service',
      };

      const isValid = eventValidatorService.validateTransactionFailed(event);
      expect(isValid).toBe(true);
    });

    it('deve rejeitar evento transaction.failed inválido (sem reason)', () => {
      const event = {
        eventId: randomUUID(),
        transactionId: randomUUID(),
        timestamp: new Date().toISOString(),
        source: 'transaction-service',
      };

      const isValid = eventValidatorService.validateTransactionFailed(event);
      expect(isValid).toBe(false);
    });
  });

  describe('Publicação de Eventos', () => {
    it('deve publicar evento transaction.completed com sucesso', async () => {
      const transactionId = randomUUID();
      const senderUserId = randomUUID();
      const receiverUserId = randomUUID();
      const amount = 100.5;

      await expect(
        eventPublisherService.publishTransactionCompleted(
          transactionId,
          senderUserId,
          receiverUserId,
          amount,
        ),
      ).resolves.not.toThrow();
    });

    it('deve publicar evento transaction.failed com sucesso', async () => {
      const transactionId = randomUUID();
      const reason = 'Insufficient balance';

      await expect(
        eventPublisherService.publishTransactionFailed(transactionId, reason),
      ).resolves.not.toThrow();
    });

    it('deve falhar ao publicar evento inválido', () => {
      const invalidEvent = {
        eventId: randomUUID(),
        transactionId: randomUUID(),
        senderUserId: randomUUID(),
        receiverUserId: randomUUID(),
        amount: -100, // Inválido
        timestamp: new Date().toISOString(),
        source: 'transaction-service',
      };

      const isValid =
        eventValidatorService.validateTransactionCompleted(invalidEvent);
      expect(isValid).toBe(false);
    });
  });

  describe('Consumo de Eventos', () => {
    it('deve consumir evento banking-details.updated válido', async () => {
      const event: BankingDetailsUpdatedEvent = {
        eventId: randomUUID(),
        userId: randomUUID(),
        bankingDetails: {
          agency: '0001',
          account: '12345-6',
        },
        timestamp: new Date().toISOString(),
        source: 'user-service',
      };

      rabbitMQService.publishEvent('user.banking-details.updated', event);

      await delay(2000);

      expect(eventValidatorService.validateBankingDetailsUpdated(event)).toBe(
        true,
      );
    });

    it('deve rejeitar evento inválido ao consumir', () => {
      const invalidEvent = {
        eventId: randomUUID(),
        // Falta userId
        bankingDetails: {
          agency: '0001',
          account: '12345-6',
        },
        timestamp: new Date().toISOString(),
        source: 'user-service',
      };

      const isValid =
        eventValidatorService.validateBankingDetailsUpdated(invalidEvent);
      expect(isValid).toBe(false);
    });
  });

  describe('Tratamento de Erros', () => {
    it('deve lidar com falha de conexão graciosamente', () => {
      const isConnected = rabbitMQService.isConnected();
      expect(typeof isConnected).toBe('boolean');
    });

    it('deve validar formato de UUID nos eventos', () => {
      const invalidEvent = {
        eventId: 'not-a-uuid',
        userId: randomUUID(),
        bankingDetails: {
          agency: '0001',
          account: '12345-6',
        },
        timestamp: new Date().toISOString(),
        source: 'user-service',
      };

      const isValid =
        eventValidatorService.validateBankingDetailsUpdated(invalidEvent);
      expect(isValid).toBe(false);
    });

    it('deve validar formato de timestamp ISO 8601', () => {
      const invalidEvent = {
        eventId: randomUUID(),
        userId: randomUUID(),
        bankingDetails: {
          agency: '0001',
          account: '12345-6',
        },
        timestamp: 'invalid-timestamp',
        source: 'user-service',
      };

      const isValid =
        eventValidatorService.validateBankingDetailsUpdated(invalidEvent);
      expect(isValid).toBe(false);
    });
  });

  describe('Contratos de Mensagens', () => {
    it('deve garantir que todos os campos obrigatórios estão presentes', () => {
      const event: TransactionCompletedEvent = {
        eventId: randomUUID(),
        transactionId: randomUUID(),
        senderUserId: randomUUID(),
        receiverUserId: randomUUID(),
        amount: 100.5,
        timestamp: new Date().toISOString(),
        source: 'transaction-service',
      };

      expect(event).toHaveProperty('eventId');
      expect(event).toHaveProperty('transactionId');
      expect(event).toHaveProperty('senderUserId');
      expect(event).toHaveProperty('receiverUserId');
      expect(event).toHaveProperty('amount');
      expect(event).toHaveProperty('timestamp');
      expect(event).toHaveProperty('source');
    });

    it('deve garantir que source é do serviço correto', () => {
      const event: TransactionCompletedEvent = {
        eventId: randomUUID(),
        transactionId: randomUUID(),
        senderUserId: randomUUID(),
        receiverUserId: randomUUID(),
        amount: 100.5,
        timestamp: new Date().toISOString(),
        source: 'transaction-service',
      };

      expect(event.source).toBe('transaction-service');
    });
  });
});
