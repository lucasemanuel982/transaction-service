import { Test, TestingModule } from '@nestjs/testing';
import { EventPublisherService } from './event-publisher.service';
import { RabbitMQService } from './rabbitmq.service';
import { EventValidatorService } from './event-validator.service';
import { RABBITMQ_CONFIG } from './rabbitmq.config';

describe('EventPublisherService', () => {
  let service: EventPublisherService;
  let rabbitMQService: RabbitMQService;
  let eventValidator: EventValidatorService;

  const mockRabbitMQService = {
    isConnected: jest.fn(),
    publishEvent: jest.fn(),
  };

  const mockEventValidator = {
    validateTransactionCompleted: jest.fn(),
    validateTransactionFailed: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventPublisherService,
        {
          provide: RabbitMQService,
          useValue: mockRabbitMQService,
        },
        {
          provide: EventValidatorService,
          useValue: mockEventValidator,
        },
      ],
    }).compile();

    service = module.get<EventPublisherService>(EventPublisherService);
    rabbitMQService = module.get<RabbitMQService>(RabbitMQService);
    eventValidator = module.get<EventValidatorService>(EventValidatorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('publishTransactionCompleted', () => {
    const transactionId = 'transaction-123';
    const senderUserId = 'sender-123';
    const receiverUserId = 'receiver-123';
    const amount = 100.5;

    it('deve publicar evento quando RabbitMQ está conectado', () => {
      mockRabbitMQService.isConnected.mockReturnValue(true);
      mockEventValidator.validateTransactionCompleted.mockReturnValue(true);
      mockRabbitMQService.publishEvent.mockReturnValue(true);

      service.publishTransactionCompleted(
        transactionId,
        senderUserId,
        receiverUserId,
        amount,
      );

      expect(mockRabbitMQService.isConnected).toHaveBeenCalled();
      expect(mockEventValidator.validateTransactionCompleted).toHaveBeenCalled();
      expect(mockRabbitMQService.publishEvent).toHaveBeenCalledWith(
        RABBITMQ_CONFIG.ROUTING_KEYS.TRANSACTION_COMPLETED,
        expect.objectContaining({
          transactionId,
          senderUserId,
          receiverUserId,
          amount,
          timestamp: expect.any(String),
          source: 'transaction-service',
          eventId: expect.any(String),
        }),
      );
    });

    it('não deve publicar evento quando RabbitMQ não está conectado', () => {
      mockRabbitMQService.isConnected.mockReturnValue(false);

      service.publishTransactionCompleted(
        transactionId,
        senderUserId,
        receiverUserId,
        amount,
      );

      expect(mockRabbitMQService.isConnected).toHaveBeenCalled();
      expect(
        mockEventValidator.validateTransactionCompleted,
      ).not.toHaveBeenCalled();
      expect(mockRabbitMQService.publishEvent).not.toHaveBeenCalled();
    });

    it('deve lançar erro quando evento é inválido', () => {
      mockRabbitMQService.isConnected.mockReturnValue(true);
      mockEventValidator.validateTransactionCompleted.mockReturnValue(false);

      expect(() => {
        service.publishTransactionCompleted(
          transactionId,
          senderUserId,
          receiverUserId,
          amount,
        );
      }).toThrow('Evento transaction.completed inválido');

      expect(mockRabbitMQService.publishEvent).not.toHaveBeenCalled();
    });

    it('deve lançar erro quando publicação retorna false', () => {
      mockRabbitMQService.isConnected.mockReturnValue(true);
      mockEventValidator.validateTransactionCompleted.mockReturnValue(true);
      mockRabbitMQService.publishEvent.mockReturnValue(false);

      expect(() => {
        service.publishTransactionCompleted(
          transactionId,
          senderUserId,
          receiverUserId,
          amount,
        );
      }).toThrow('Falha ao publicar evento transaction.completed');

      expect(mockRabbitMQService.publishEvent).toHaveBeenCalled();
    });

    it('deve lançar erro quando publicação lança exceção', () => {
      const error = new Error('Falha ao publicar');
      mockRabbitMQService.isConnected.mockReturnValue(true);
      mockEventValidator.validateTransactionCompleted.mockReturnValue(true);
      mockRabbitMQService.publishEvent.mockImplementation(() => {
        throw error;
      });

      expect(() => {
        service.publishTransactionCompleted(
          transactionId,
          senderUserId,
          receiverUserId,
          amount,
        );
      }).toThrow(error);
    });

    it('deve incluir eventId único no evento', () => {
      mockRabbitMQService.isConnected.mockReturnValue(true);
      mockEventValidator.validateTransactionCompleted.mockReturnValue(true);
      mockRabbitMQService.publishEvent.mockReturnValue(true);

      service.publishTransactionCompleted(
        transactionId,
        senderUserId,
        receiverUserId,
        amount,
      );

      const publishCall = mockRabbitMQService.publishEvent.mock.calls[0];
      const event = publishCall[1] as { eventId: string };

      expect(event.eventId).toBeDefined();
      expect(typeof event.eventId).toBe('string');
      expect(event.eventId.length).toBeGreaterThan(0);
    });

    it('deve incluir timestamp no formato ISO no evento', () => {
      mockRabbitMQService.isConnected.mockReturnValue(true);
      mockEventValidator.validateTransactionCompleted.mockReturnValue(true);
      mockRabbitMQService.publishEvent.mockReturnValue(true);

      service.publishTransactionCompleted(
        transactionId,
        senderUserId,
        receiverUserId,
        amount,
      );

      const publishCall = mockRabbitMQService.publishEvent.mock.calls[0];
      const event = publishCall[1] as { timestamp: string };

      expect(event.timestamp).toBeDefined();
      expect(() => new Date(event.timestamp)).not.toThrow();
      expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);
    });

    it('deve incluir source correto no evento', () => {
      mockRabbitMQService.isConnected.mockReturnValue(true);
      mockEventValidator.validateTransactionCompleted.mockReturnValue(true);
      mockRabbitMQService.publishEvent.mockReturnValue(true);

      service.publishTransactionCompleted(
        transactionId,
        senderUserId,
        receiverUserId,
        amount,
      );

      const publishCall = mockRabbitMQService.publishEvent.mock.calls[0];
      const event = publishCall[1] as { source: string };

      expect(event.source).toBe('transaction-service');
    });
  });

  describe('publishTransactionFailed', () => {
    const transactionId = 'transaction-123';
    const reason = 'Saldo insuficiente';

    it('deve publicar evento quando RabbitMQ está conectado', () => {
      mockRabbitMQService.isConnected.mockReturnValue(true);
      mockEventValidator.validateTransactionFailed.mockReturnValue(true);
      mockRabbitMQService.publishEvent.mockReturnValue(true);

      service.publishTransactionFailed(transactionId, reason);

      expect(mockRabbitMQService.isConnected).toHaveBeenCalled();
      expect(mockEventValidator.validateTransactionFailed).toHaveBeenCalled();
      expect(mockRabbitMQService.publishEvent).toHaveBeenCalledWith(
        RABBITMQ_CONFIG.ROUTING_KEYS.TRANSACTION_FAILED,
        expect.objectContaining({
          transactionId,
          reason,
          timestamp: expect.any(String),
          source: 'transaction-service',
          eventId: expect.any(String),
        }),
      );
    });

    it('não deve publicar evento quando RabbitMQ não está conectado', () => {
      mockRabbitMQService.isConnected.mockReturnValue(false);

      service.publishTransactionFailed(transactionId, reason);

      expect(mockRabbitMQService.isConnected).toHaveBeenCalled();
      expect(
        mockEventValidator.validateTransactionFailed,
      ).not.toHaveBeenCalled();
      expect(mockRabbitMQService.publishEvent).not.toHaveBeenCalled();
    });

    it('deve lançar erro quando evento é inválido', () => {
      mockRabbitMQService.isConnected.mockReturnValue(true);
      mockEventValidator.validateTransactionFailed.mockReturnValue(false);

      expect(() => {
        service.publishTransactionFailed(transactionId, reason);
      }).toThrow('Evento transaction.failed inválido');

      expect(mockRabbitMQService.publishEvent).not.toHaveBeenCalled();
    });

    it('deve lançar erro quando publicação retorna false', () => {
      mockRabbitMQService.isConnected.mockReturnValue(true);
      mockEventValidator.validateTransactionFailed.mockReturnValue(true);
      mockRabbitMQService.publishEvent.mockReturnValue(false);

      expect(() => {
        service.publishTransactionFailed(transactionId, reason);
      }).toThrow('Falha ao publicar evento transaction.failed');

      expect(mockRabbitMQService.publishEvent).toHaveBeenCalled();
    });

    it('deve lançar erro quando publicação lança exceção', () => {
      const error = new Error('Falha ao publicar');
      mockRabbitMQService.isConnected.mockReturnValue(true);
      mockEventValidator.validateTransactionFailed.mockReturnValue(true);
      mockRabbitMQService.publishEvent.mockImplementation(() => {
        throw error;
      });

      expect(() => {
        service.publishTransactionFailed(transactionId, reason);
      }).toThrow(error);
    });

    it('deve incluir eventId único no evento', () => {
      mockRabbitMQService.isConnected.mockReturnValue(true);
      mockEventValidator.validateTransactionFailed.mockReturnValue(true);
      mockRabbitMQService.publishEvent.mockReturnValue(true);

      service.publishTransactionFailed(transactionId, reason);

      const publishCall = mockRabbitMQService.publishEvent.mock.calls[0];
      const event = publishCall[1] as { eventId: string };

      expect(event.eventId).toBeDefined();
      expect(typeof event.eventId).toBe('string');
      expect(event.eventId.length).toBeGreaterThan(0);
    });
  });
});
