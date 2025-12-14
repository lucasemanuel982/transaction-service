import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../database/prisma.service';
import { UserClientService } from '../clients/user-client.service';
import { EventPublisherService } from '../messaging/event-publisher.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import {
  TransactionType,
  TransactionStatus,
} from './dto/find-transactions-query.dto';

describe('TransactionsService', () => {
  let service: TransactionsService;

  const mockPrismaService = {
    transaction: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
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
    mockUserClientService.validateUserExists.mockReset();
    mockPrismaService.$transaction.mockReset();
    mockEventPublisherService.publishTransactionCompleted.mockReset();
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
          const mockReceiverBalance = {
            userId: 'receiver-uuid',
            balance: 0,
          };
          const mockTx = {
            transaction: {
              create: jest.fn().mockResolvedValue(mockTransaction),
            },
            accountBalance: {
              findUnique: jest
                .fn()
                .mockResolvedValueOnce(mockSenderBalance)
                .mockResolvedValueOnce(mockReceiverBalance)
                .mockResolvedValueOnce(mockSenderBalance),
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
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('deve criar transação sem descrição quando description não é fornecida', async () => {
      const dtoWithoutDescription: CreateTransactionDto = {
        ...mockCreateTransactionDto,
        description: undefined,
      };

      mockUserClientService.validateUserExists.mockResolvedValue(true);
      const mockSenderBalance = {
        userId: 'sender-uuid',
        balance: 500,
      };
      const mockReceiverBalance = {
        userId: 'receiver-uuid',
        balance: 0,
      };
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
              create: jest.fn().mockResolvedValue({
                ...mockTransaction,
                description: null,
              }),
            },
            accountBalance: {
              findUnique: jest
                .fn()
                .mockResolvedValueOnce(mockSenderBalance)
                .mockResolvedValueOnce(mockReceiverBalance) // ensureAccountBalanceExists(receiver)
                .mockResolvedValueOnce(mockSenderBalance), // Verificação de saldo do sender
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

      const result = await service.create(dtoWithoutDescription, 'token');

      expect(result.description).toBeNull();
    });

    it('deve continuar mesmo se publicação de evento falhar', async () => {
      mockUserClientService.validateUserExists.mockResolvedValue(true);
      const mockSenderBalance = {
        userId: 'sender-uuid',
        balance: 500,
      };
      const mockReceiverBalance = {
        userId: 'receiver-uuid',
        balance: 0,
      };
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
                .mockResolvedValueOnce(mockSenderBalance)
                .mockResolvedValueOnce(mockReceiverBalance)
                .mockResolvedValueOnce(mockSenderBalance),
              create: jest.fn(),
              update: jest.fn().mockResolvedValue({}),
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
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce({ userId: 'sender-uuid', balance: 500 })
                .mockResolvedValueOnce({ userId: 'receiver-uuid', balance: 0 }),
              create: jest
                .fn()
                .mockResolvedValueOnce({ userId: 'sender-uuid', balance: 0 })
                .mockResolvedValueOnce({ userId: 'receiver-uuid', balance: 0 }),
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

  describe('findOne', () => {
    const mockTransaction = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      senderUserId: 'sender-uuid',
      receiverUserId: 'receiver-uuid',
      amount: 100.5,
      description: 'Test transaction',
      status: 'COMPLETED',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    };

    it('deve buscar uma transação com sucesso', async () => {
      mockPrismaService.transaction.findUnique = jest
        .fn()
        .mockResolvedValue(mockTransaction);

      const result = await service.findOne(
        '550e8400-e29b-41d4-a716-446655440000',
      );

      expect(result).toEqual(mockTransaction);
      expect(mockPrismaService.transaction.findUnique).toHaveBeenCalledWith({
        where: { id: '550e8400-e29b-41d4-a716-446655440000' },
      });
      expect(mockPrismaService.transaction.findUnique).toHaveBeenCalledTimes(1);
    });

    it('deve lançar NotFoundException quando transação não é encontrada', async () => {
      mockPrismaService.transaction.findUnique = jest
        .fn()
        .mockResolvedValue(null);

      await expect(
        service.findOne('550e8400-e29b-41d4-a716-446655440000'),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrismaService.transaction.findUnique).toHaveBeenCalledWith({
        where: { id: '550e8400-e29b-41d4-a716-446655440000' },
      });
    });

    it('deve lançar BadRequestException quando ID é vazio', async () => {
      await expect(service.findOne('')).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.transaction.findUnique).not.toHaveBeenCalled();
    });

    it('deve lançar BadRequestException quando ID é apenas espaços', async () => {
      await expect(service.findOne('   ')).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.transaction.findUnique).not.toHaveBeenCalled();
    });

    it('deve lançar BadRequestException quando ID não é uma string', async () => {
      await expect(service.findOne(null as unknown as string)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrismaService.transaction.findUnique).not.toHaveBeenCalled();
    });

    it('deve lançar BadRequestException quando ID não é um UUID válido', async () => {
      await expect(service.findOne('invalid-uuid')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrismaService.transaction.findUnique).not.toHaveBeenCalled();
    });

    it('deve remover espaços em branco do ID antes de buscar', async () => {
      mockPrismaService.transaction.findUnique = jest
        .fn()
        .mockResolvedValue(mockTransaction);

      const result = await service.findOne(
        '  550e8400-e29b-41d4-a716-446655440000  ',
      );

      expect(result).toEqual(mockTransaction);
      expect(mockPrismaService.transaction.findUnique).toHaveBeenCalledWith({
        where: { id: '550e8400-e29b-41d4-a716-446655440000' },
      });
    });

    it('deve lançar InternalServerErrorException quando ocorre erro no banco', async () => {
      mockPrismaService.transaction.findUnique = jest
        .fn()
        .mockRejectedValue(new Error('Database error'));

      await expect(
        service.findOne('550e8400-e29b-41d4-a716-446655440000'),
      ).rejects.toThrow('Erro ao buscar transação');

      expect(mockPrismaService.transaction.findUnique).toHaveBeenCalled();
    });

    it('deve retornar transação com tipos corretos', async () => {
      mockPrismaService.transaction.findUnique = jest
        .fn()
        .mockResolvedValue(mockTransaction);

      const result = await service.findOne(
        '550e8400-e29b-41d4-a716-446655440000',
      );

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('senderUserId');
      expect(result).toHaveProperty('receiverUserId');
      expect(result).toHaveProperty('amount');
      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('createdAt');
      expect(result).toHaveProperty('updatedAt');
      expect(typeof result.id).toBe('string');
      expect(typeof result.senderUserId).toBe('string');
      expect(typeof result.receiverUserId).toBe('string');
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('findByUser', () => {
    const mockTransactions = [
      {
        id: 'transaction-1',
        senderUserId: '550e8400-e29b-41d4-a716-446655440000',
        receiverUserId: 'receiver-uuid',
        amount: 100.5,
        description: 'Test transaction 1',
        status: 'COMPLETED',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      },
      {
        id: 'transaction-2',
        senderUserId: 'sender-uuid',
        receiverUserId: '550e8400-e29b-41d4-a716-446655440000',
        amount: 200.75,
        description: 'Test transaction 2',
        status: 'PENDING',
        createdAt: new Date('2024-01-02T00:00:00.000Z'),
        updatedAt: new Date('2024-01-02T00:00:00.000Z'),
      },
    ];

    it('deve listar transações de um usuário com sucesso', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue(
        mockTransactions,
      );
      mockPrismaService.transaction.count.mockResolvedValue(2);

      const result = await service.findByUser(
        '550e8400-e29b-41d4-a716-446655440000',
        1,
        10,
      );

      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
      expect(result.data[0].amount).toBe(100.5);
      expect(result.data[1].amount).toBe(200.75);
      expect(mockPrismaService.transaction.findMany).toHaveBeenCalled();
      expect(mockPrismaService.transaction.count).toHaveBeenCalled();
    });

    it('deve filtrar transações por tipo SENT', async () => {
      const sentTransactions = [mockTransactions[0]];
      mockPrismaService.transaction.findMany.mockResolvedValue(
        sentTransactions,
      );
      mockPrismaService.transaction.count.mockResolvedValue(1);

      const result = await service.findByUser(
        '550e8400-e29b-41d4-a716-446655440000',
        1,
        10,
        TransactionType.SENT,
      );

      expect(result.data).toHaveLength(1);
      expect(result.data[0].senderUserId).toBe(
        '550e8400-e29b-41d4-a716-446655440000',
      );
      expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { senderUserId: '550e8400-e29b-41d4-a716-446655440000' },
            ] as Array<{ senderUserId: string }>,
          }) as unknown,
        }) as unknown,
      );
    });

    it('deve filtrar transações por tipo RECEIVED', async () => {
      const receivedTransactions = [mockTransactions[1]];
      mockPrismaService.transaction.findMany.mockResolvedValue(
        receivedTransactions,
      );
      mockPrismaService.transaction.count.mockResolvedValue(1);

      const result = await service.findByUser(
        '550e8400-e29b-41d4-a716-446655440000',
        1,
        10,
        TransactionType.RECEIVED,
      );

      expect(result.data).toHaveLength(1);
      expect(result.data[0].receiverUserId).toBe(
        '550e8400-e29b-41d4-a716-446655440000',
      );
      expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { receiverUserId: '550e8400-e29b-41d4-a716-446655440000' },
            ] as Array<{ receiverUserId: string }>,
          }) as unknown,
        }) as unknown,
      );
    });

    it('deve filtrar transações por status', async () => {
      const completedTransactions = [mockTransactions[0]];
      mockPrismaService.transaction.findMany.mockResolvedValue(
        completedTransactions,
      );
      mockPrismaService.transaction.count.mockResolvedValue(1);

      const result = await service.findByUser(
        '550e8400-e29b-41d4-a716-446655440000',
        1,
        10,
        undefined,
        TransactionStatus.COMPLETED,
      );

      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe('COMPLETED');
      expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: TransactionStatus.COMPLETED,
          }) as { status: TransactionStatus },
        }),
      );
    });

    it('deve combinar filtros de tipo e status', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([]);
      mockPrismaService.transaction.count.mockResolvedValue(0);

      await service.findByUser(
        '550e8400-e29b-41d4-a716-446655440000',
        1,
        10,
        TransactionType.SENT,
        TransactionStatus.COMPLETED,
      );

      expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { senderUserId: '550e8400-e29b-41d4-a716-446655440000' },
            ] as Array<{ senderUserId: string }>,
            status: TransactionStatus.COMPLETED,
          }) as unknown,
        }) as unknown,
      );
    });

    it('deve aplicar paginação corretamente', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue(
        mockTransactions,
      );
      mockPrismaService.transaction.count.mockResolvedValue(25);

      const result = await service.findByUser(
        '550e8400-e29b-41d4-a716-446655440000',
        2,
        10,
      );

      expect(result.pagination.page).toBe(2);
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.total).toBe(25);
      expect(result.pagination.totalPages).toBe(3);
      expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        }),
      );
    });

    it('deve lançar BadRequestException quando userId é vazio', async () => {
      await expect(service.findByUser('', 1, 10)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrismaService.transaction.findMany).not.toHaveBeenCalled();
    });

    it('deve lançar BadRequestException quando userId não é uma string', async () => {
      await expect(
        service.findByUser(null as unknown as string, 1, 10),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.transaction.findMany).not.toHaveBeenCalled();
    });

    it('deve lançar BadRequestException quando userId não é um UUID válido', async () => {
      await expect(service.findByUser('invalid-uuid', 1, 10)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrismaService.transaction.findMany).not.toHaveBeenCalled();
    });

    it('deve lançar BadRequestException quando page é inválido', async () => {
      await expect(
        service.findByUser('550e8400-e29b-41d4-a716-446655440000', 0, 10),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.findByUser('550e8400-e29b-41d4-a716-446655440000', -1, 10),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.findByUser('550e8400-e29b-41d4-a716-446655440000', 1.5, 10),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve lançar BadRequestException quando limit é inválido', async () => {
      await expect(
        service.findByUser('550e8400-e29b-41d4-a716-446655440000', 1, 0),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.findByUser('550e8400-e29b-41d4-a716-446655440000', 1, -1),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.findByUser('550e8400-e29b-41d4-a716-446655440000', 1, 101),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.findByUser('550e8400-e29b-41d4-a716-446655440000', 1, 1.5),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve remover espaços em branco do userId', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue(
        mockTransactions,
      );
      mockPrismaService.transaction.count.mockResolvedValue(2);

      await service.findByUser(
        '  550e8400-e29b-41d4-a716-446655440000  ',
        1,
        10,
      );

      expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { senderUserId: '550e8400-e29b-41d4-a716-446655440000' },
              { receiverUserId: '550e8400-e29b-41d4-a716-446655440000' },
            ]) as Array<{ senderUserId?: string; receiverUserId?: string }>,
          }) as {
            OR: Array<{ senderUserId?: string; receiverUserId?: string }>;
          },
        }),
      );
    });

    it('deve converter tipos corretamente no retorno', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue(
        mockTransactions,
      );
      mockPrismaService.transaction.count.mockResolvedValue(2);

      const result = await service.findByUser(
        '550e8400-e29b-41d4-a716-446655440000',
        1,
        10,
      );

      expect(typeof result.data[0].id).toBe('string');
      expect(typeof result.data[0].amount).toBe('number');
      expect(result.data[0].amount).toBe(100.5);
      expect(result.data[1].amount).toBe(200.75);
      expect(result.data[0].createdAt).toBeInstanceOf(Date);
      expect(result.data[0].updatedAt).toBeInstanceOf(Date);
    });

    it('deve lançar InternalServerErrorException quando ocorre erro no banco', async () => {
      mockPrismaService.transaction.findMany.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.findByUser('550e8400-e29b-41d4-a716-446655440000', 1, 10),
      ).rejects.toThrow('Erro ao listar transações');
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
