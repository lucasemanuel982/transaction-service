import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../database/prisma.service';
import { UserClientService } from '../clients/user-client.service';
import { EventPublisherService } from '../messaging/event-publisher.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CreateTransactionDto } from './dto/create-transaction.dto';

describe('TransactionsService', () => {
  let service: TransactionsService;

  const mockPrismaService = {
    transaction: {
      create: jest.fn(),
    },
    accountBalance: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockUserClientService = {
    validateUserExists: jest.fn(),
  };

  const mockEventPublisherService = {
    publishTransactionCompleted: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: UserClientService,
          useValue: mockUserClientService,
        },
        {
          provide: EventPublisherService,
          useValue: mockEventPublisherService,
        },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const mockCreateTransactionDto: CreateTransactionDto = {
      senderUserId: 'sender-uuid',
      receiverUserId: 'receiver-uuid',
      amount: 100.5,
      description: 'Test transaction',
    };

    const mockTransaction = {
      id: 'transaction-uuid',
      senderUserId: 'sender-uuid',
      receiverUserId: 'receiver-uuid',
      amount: 100.5,
      description: 'Test transaction',
      status: 'COMPLETED',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('deve criar uma transação com sucesso', async () => {
      mockUserClientService.validateUserExists.mockResolvedValue(true);
      mockPrismaService.$transaction.mockImplementation(
        async (
          callback: (tx: {
            transaction: { create: jest.Mock };
            accountBalance: {
              findUnique: jest.Mock;
              create: jest.Mock;
              update: jest.Mock;
            };
          }) => unknown,
        ) => {
          const mockSenderBalance = {
            userId: 'sender-uuid',
            balance: 500,
          };
          const mockTx = {
            transaction: {
              create: jest.fn().mockResolvedValue(mockTransaction),
            },
            accountBalance: {
              findUnique: jest
                .fn()
                .mockResolvedValueOnce(mockSenderBalance)
                .mockResolvedValueOnce({ userId: 'receiver-uuid', balance: 0 }),
              create: jest.fn(),
              update: jest.fn().mockResolvedValue({}),
            },
          };
          return callback(mockTx) as Promise<typeof mockTransaction>;
        },
      );
      mockEventPublisherService.publishTransactionCompleted.mockResolvedValue(
        undefined,
      );

      const result = await service.create(mockCreateTransactionDto, 'token');

      expect(result).toEqual(mockTransaction);
      expect(mockUserClientService.validateUserExists).toHaveBeenCalledTimes(2);
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(
        mockEventPublisherService.publishTransactionCompleted,
      ).toHaveBeenCalledWith(
        'transaction-uuid',
        'sender-uuid',
        'receiver-uuid',
        100.5,
      );
    });

    it('deve lançar BadRequestException quando senderUserId e receiverUserId são iguais', async () => {
      const invalidDto: CreateTransactionDto = {
        ...mockCreateTransactionDto,
        receiverUserId: 'sender-uuid',
      };

      await expect(service.create(invalidDto, 'token')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockUserClientService.validateUserExists).not.toHaveBeenCalled();
    });

    it('deve lançar BadRequestException quando amount é zero ou negativo', async () => {
      const invalidDto: CreateTransactionDto = {
        ...mockCreateTransactionDto,
        amount: 0,
      };

      await expect(service.create(invalidDto, 'token')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('deve lançar NotFoundException quando senderUserId não existe', async () => {
      mockUserClientService.validateUserExists
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      await expect(
        service.create(mockCreateTransactionDto, 'token'),
      ).rejects.toThrow(NotFoundException);
      expect(mockUserClientService.validateUserExists).toHaveBeenCalledTimes(1);
    });

    it('deve lançar NotFoundException quando receiverUserId não existe', async () => {
      mockUserClientService.validateUserExists
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      await expect(
        service.create(mockCreateTransactionDto, 'token'),
      ).rejects.toThrow(NotFoundException);
      expect(mockUserClientService.validateUserExists).toHaveBeenCalledTimes(2);
    });

    it('deve criar transação sem descrição quando description não é fornecida', async () => {
      const dtoWithoutDescription: CreateTransactionDto = {
        ...mockCreateTransactionDto,
        description: undefined,
      };

      mockUserClientService.validateUserExists.mockResolvedValue(true);
      mockPrismaService.$transaction.mockImplementation(
        async (
          callback: (tx: { transaction: { create: jest.Mock } }) => unknown,
        ) => {
          const mockTx = {
            transaction: {
              create: jest.fn().mockResolvedValue({
                ...mockTransaction,
                description: null,
              }),
            },
          };
          return callback(mockTx) as Promise<typeof mockTransaction>;
        },
      );
      mockEventPublisherService.publishTransactionCompleted.mockResolvedValue(
        undefined,
      );

      const result = await service.create(dtoWithoutDescription, 'token');

      expect(result.description).toBeNull();
    });

    it('deve continuar mesmo se publicação de evento falhar', async () => {
      mockUserClientService.validateUserExists.mockResolvedValue(true);
      mockPrismaService.$transaction.mockImplementation(
        async (
          callback: (tx: { transaction: { create: jest.Mock } }) => unknown,
        ) => {
          const mockTx = {
            transaction: {
              create: jest.fn().mockResolvedValue(mockTransaction),
            },
          };
          return callback(mockTx) as Promise<typeof mockTransaction>;
        },
      );
      mockEventPublisherService.publishTransactionCompleted.mockRejectedValue(
        new Error('Event publish failed'),
      );

      const result = await service.create(mockCreateTransactionDto, 'token');

      expect(result).toEqual(mockTransaction);
      expect(
        mockEventPublisherService.publishTransactionCompleted,
      ).toHaveBeenCalled();
    });

    it('deve lançar BadRequestException quando saldo é insuficiente', async () => {
      mockUserClientService.validateUserExists.mockResolvedValue(true);
      mockPrismaService.$transaction.mockImplementation(
        async (
          callback: (tx: {
            transaction: { create: jest.Mock };
            accountBalance: {
              findUnique: jest.Mock;
              create: jest.Mock;
            };
          }) => unknown,
        ) => {
          const mockSenderBalance = {
            userId: 'sender-uuid',
            balance: 50, // Saldo menor que o valor da transação (100.5)
          };
          const mockTx = {
            transaction: {
              create: jest.fn(),
            },
            accountBalance: {
              findUnique: jest.fn().mockResolvedValue(mockSenderBalance),
              create: jest.fn(),
            },
          };
          return callback(mockTx) as Promise<typeof mockTransaction>;
        },
      );

      await expect(
        service.create(mockCreateTransactionDto, 'token'),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve criar saldo sob demanda se não existir', async () => {
      mockUserClientService.validateUserExists.mockResolvedValue(true);
      mockPrismaService.$transaction.mockImplementation(
        async (
          callback: (tx: {
            transaction: { create: jest.Mock };
            accountBalance: {
              findUnique: jest.Mock;
              create: jest.Mock;
              update: jest.Mock;
            };
          }) => unknown,
        ) => {
          const mockTx = {
            transaction: {
              create: jest.fn().mockResolvedValue(mockTransaction),
            },
            accountBalance: {
              findUnique: jest
                .fn()
                .mockResolvedValueOnce(null) // Primeira chamada: saldo não existe
                .mockResolvedValueOnce(null) // Segunda chamada: saldo não existe
                .mockResolvedValueOnce({ userId: 'sender-uuid', balance: 0 }) // Após criar
                .mockResolvedValueOnce({ userId: 'receiver-uuid', balance: 0 }),
              create: jest
                .fn()
                .mockResolvedValue({ userId: 'sender-uuid', balance: 0 }),
              update: jest.fn().mockResolvedValue({}),
            },
          };
          return callback(mockTx) as Promise<typeof mockTransaction>;
        },
      );
      mockEventPublisherService.publishTransactionCompleted.mockResolvedValue(
        undefined,
      );

      const result = await service.create(mockCreateTransactionDto, 'token');

      expect(result).toEqual(mockTransaction);
    });
  });

  describe('getBalance', () => {
    it('deve retornar saldo do usuário', async () => {
      const mockBalance = {
        userId: 'user-uuid',
        balance: 1000.5,
        id: 'balance-uuid',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.accountBalance.findUnique.mockResolvedValue(
        mockBalance,
      );

      const result = await service.getBalance('user-uuid');

      expect(result).toEqual({
        userId: 'user-uuid',
        balance: 1000.5,
      });
      expect(mockPrismaService.accountBalance.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-uuid' },
      });
    });

    it('deve criar saldo com valor 0 se não existir', async () => {
      const mockCreatedBalance = {
        userId: 'user-uuid',
        balance: 0,
        id: 'balance-uuid',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.accountBalance.findUnique.mockResolvedValue(null);
      mockPrismaService.accountBalance.create.mockResolvedValue(
        mockCreatedBalance,
      );

      const result = await service.getBalance('user-uuid');

      expect(result).toEqual({
        userId: 'user-uuid',
        balance: 0,
      });
      expect(mockPrismaService.accountBalance.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-uuid',
          balance: 0,
        },
      });
    });

    it('deve lançar BadRequestException quando userId é inválido', async () => {
      await expect(service.getBalance('')).rejects.toThrow(BadRequestException);
    });
  });
});
