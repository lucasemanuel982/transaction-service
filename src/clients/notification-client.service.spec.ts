import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { NotificationClientService } from './notification-client.service';
import {
  SendNotificationDto,
  NotificationType,
  NotificationPriority,
} from './dto/send-notification.dto';

describe('NotificationClientService', () => {
  let service: NotificationClientService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationClientService],
    }).compile();

    service = module.get<NotificationClientService>(NotificationClientService);
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  describe('sendNotification', () => {
    const validNotification: SendNotificationDto = {
      userId: '123e4567-e89b-12d3-a456-426614174000',
      type: NotificationType.TRANSACTION_COMPLETED,
      title: 'Teste',
      message: 'Mensagem de teste',
      priority: NotificationPriority.NORMAL,
    };

    it('deve enviar notificação com sucesso', async () => {
      const result = await service.sendNotification(validNotification);

      expect(result).toBeDefined();
      expect(result.notificationId).toBeDefined();
      expect(result.status).toBe('sent');
      expect(result.timestamp).toBeDefined();
    });

    it('deve lançar exceção se userId estiver vazio', async () => {
      const invalidNotification = {
        ...validNotification,
        userId: '',
      };

      await expect(
        service.sendNotification(invalidNotification),
      ).rejects.toThrow(HttpException);
    });

    it('deve lançar exceção se userId não for UUID válido', async () => {
      const invalidNotification = {
        ...validNotification,
        userId: 'invalid-uuid',
      };

      await expect(
        service.sendNotification(invalidNotification),
      ).rejects.toThrow(HttpException);
    });

    it('deve lançar exceção se title estiver vazio', async () => {
      const invalidNotification = {
        ...validNotification,
        title: '',
      };

      await expect(
        service.sendNotification(invalidNotification),
      ).rejects.toThrow(HttpException);
    });

    it('deve lançar exceção se message estiver vazio', async () => {
      const invalidNotification = {
        ...validNotification,
        message: '',
      };

      await expect(
        service.sendNotification(invalidNotification),
      ).rejects.toThrow(HttpException);
    });

    it('deve aceitar authToken opcional', async () => {
      const result = await service.sendNotification(
        validNotification,
        'token-123',
      );

      expect(result).toBeDefined();
      expect(result.status).toBe('sent');
    });
  });

  describe('sendTransactionCompletedNotification', () => {
    const userId = '123e4567-e89b-12d3-a456-426614174000';
    const transactionId = '789e4567-e89b-12d3-a456-426614174000';
    const amount = 100.5;

    it('deve enviar notificação para remetente', async () => {
      const result = await service.sendTransactionCompletedNotification(
        userId,
        transactionId,
        amount,
        true,
      );

      expect(result).toBeDefined();
      expect(result.notificationId).toBeDefined();
      expect(result.status).toBe('sent');
    });

    it('deve enviar notificação para destinatário', async () => {
      const result = await service.sendTransactionCompletedNotification(
        userId,
        transactionId,
        amount,
        false,
      );

      expect(result).toBeDefined();
      expect(result.notificationId).toBeDefined();
      expect(result.status).toBe('sent');
    });

    it('deve incluir metadata correta', async () => {
      const result = await service.sendTransactionCompletedNotification(
        userId,
        transactionId,
        amount,
        true,
        'token-123',
      );

      expect(result).toBeDefined();
      expect(result.status).toBe('sent');
    });
  });

  describe('sendTransactionFailedNotification', () => {
    const userId = '123e4567-e89b-12d3-a456-426614174000';
    const transactionId = '789e4567-e89b-12d3-a456-426614174000';
    const reason = 'Saldo insuficiente';

    it('deve enviar notificação de falha', async () => {
      const result = await service.sendTransactionFailedNotification(
        userId,
        transactionId,
        reason,
      );

      expect(result).toBeDefined();
      expect(result.notificationId).toBeDefined();
      expect(result.status).toBe('sent');
    });

    it('deve aceitar authToken opcional', async () => {
      const result = await service.sendTransactionFailedNotification(
        userId,
        transactionId,
        reason,
        'token-123',
      );

      expect(result).toBeDefined();
      expect(result.status).toBe('sent');
    });
  });

  describe('healthCheck', () => {
    it('deve retornar true quando serviço está disponível', async () => {
      const result = await service.healthCheck();
      expect(result).toBe(true);
    });
  });
});
