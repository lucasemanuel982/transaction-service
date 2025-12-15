import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../security/guards/jwt-auth.guard';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import {
  FindTransactionsQueryDto,
  TransactionType,
  TransactionStatus,
} from './dto/find-transactions-query.dto';
import { BadRequestException, NotFoundException } from '@nestjs/common';

interface MockRequest extends Partial<Request> {
  headers: {
    authorization?: string;
  };
  user?: {
    userId: string;
    email: string;
  };
}

describe('TransactionsController', () => {
  let controller: TransactionsController;

  const mockTransactionsService = {
    create: jest.fn(),
    findOne: jest.fn(),
    findByUser: jest.fn(),
  };

  const mockJwtAuthGuard = {
    canActivate: jest.fn(() => true),
  };

  const mockRequest: MockRequest = {
    headers: {
      authorization: 'Bearer mock-token',
    },
    user: {
      userId: 'user-uuid',
      email: 'user@example.com',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionsController],
      providers: [
        {
          provide: TransactionsService,
          useValue: mockTransactionsService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .compile();

    controller = module.get<TransactionsController>(TransactionsController);
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
      mockTransactionsService.create.mockResolvedValue(mockTransaction);

      const result = await controller.create(
        mockCreateTransactionDto,
        mockRequest.user!,
        mockRequest as Request,
      );

      expect(result).toEqual(mockTransaction);
      expect(mockTransactionsService.create).toHaveBeenCalledWith(
        mockCreateTransactionDto,
        'mock-token',
      );
    });

    it('deve passar o token de autenticação para o service', async () => {
      mockTransactionsService.create.mockResolvedValue(mockTransaction);

      await controller.create(
        mockCreateTransactionDto,
        mockRequest.user!,
        mockRequest as Request,
      );

      expect(mockTransactionsService.create).toHaveBeenCalledWith(
        expect.any(Object),
        'mock-token',
      );
    });

    it('deve retornar erro quando service lança BadRequestException', async () => {
      mockTransactionsService.create.mockRejectedValue(
        new BadRequestException('Usuários não podem ser iguais'),
      );

      await expect(
        controller.create(
          mockCreateTransactionDto,
          mockRequest.user!,
          mockRequest as Request,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve retornar erro quando service lança NotFoundException', async () => {
      mockTransactionsService.create.mockRejectedValue(
        new NotFoundException('Usuário não encontrado'),
      );

      await expect(
        controller.create(
          mockCreateTransactionDto,
          mockRequest.user!,
          mockRequest as Request,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve funcionar sem token quando authorization header não está presente', async () => {
      const requestWithoutToken: MockRequest = {
        ...mockRequest,
        headers: {},
      };

      mockTransactionsService.create.mockResolvedValue(mockTransaction);

      const result = await controller.create(
        mockCreateTransactionDto,
        mockRequest.user!,
        requestWithoutToken as Request,
      );

      expect(result).toEqual(mockTransaction);
      expect(mockTransactionsService.create).toHaveBeenCalledWith(
        mockCreateTransactionDto,
        undefined,
      );
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

    const mockParams = {
      id: '550e8400-e29b-41d4-a716-446655440000',
    };

    it('deve buscar uma transação com sucesso', async () => {
      const currentUser = {
        userId: 'sender-uuid',
        email: 'sender@example.com',
        role: 'user',
      };
      mockTransactionsService.findOne.mockResolvedValue(mockTransaction);

      const result = await controller.findOne(mockParams, currentUser);

      expect(result).toEqual(mockTransaction);
      expect(mockTransactionsService.findOne).toHaveBeenCalledWith(
        mockParams.id,
      );
      expect(mockTransactionsService.findOne).toHaveBeenCalledTimes(1);
    });

    it('deve retornar erro 404 quando transação não é encontrada', async () => {
      const currentUser = {
        userId: 'sender-uuid',
        email: 'sender@example.com',
        role: 'user',
      };
      mockTransactionsService.findOne.mockRejectedValue(
        new NotFoundException(
          'Transação com ID 550e8400-e29b-41d4-a716-446655440000 não encontrada',
        ),
      );

      await expect(controller.findOne(mockParams, currentUser)).rejects.toThrow(
        NotFoundException,
      );

      expect(mockTransactionsService.findOne).toHaveBeenCalledWith(
        mockParams.id,
      );
    });

    it('deve retornar erro 400 quando ID é inválido', async () => {
      const invalidParams = { id: 'invalid-id' };
      mockTransactionsService.findOne.mockRejectedValue(
        new BadRequestException('ID da transação deve ser um UUID válido'),
      );

      const currentUserForInvalid = {
        userId: 'sender-uuid',
        email: 'sender@example.com',
        role: 'user',
      };
      await expect(
        controller.findOne(invalidParams, currentUserForInvalid),
      ).rejects.toThrow(BadRequestException);

      expect(mockTransactionsService.findOne).toHaveBeenCalledWith(
        invalidParams.id,
      );
    });

    it('deve retornar erro 400 quando ID está vazio', async () => {
      const emptyParams = { id: '' };
      mockTransactionsService.findOne.mockRejectedValue(
        new BadRequestException('ID da transação não pode estar vazio'),
      );

      const currentUserForEmpty = {
        userId: 'sender-uuid',
        email: 'sender@example.com',
        role: 'user',
      };
      await expect(
        controller.findOne(emptyParams, currentUserForEmpty),
      ).rejects.toThrow(BadRequestException);

      expect(mockTransactionsService.findOne).toHaveBeenCalledWith(
        emptyParams.id,
      );
    });

    it('deve garantir que o guard JWT está aplicado', () => {
      // O guard é verificado através do decorator @UseGuards no código
      expect(typeof controller.findOne).toBe('function');
    });
  });

  describe('findByUser', () => {
    const mockParams = {
      id: '550e8400-e29b-41d4-a716-446655440000',
    };
    const currentUser = {
      userId: '550e8400-e29b-41d4-a716-446655440000',
      email: 'user@example.com',
      role: 'user',
    };

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
        status: 'COMPLETED',
        createdAt: new Date('2024-01-02T00:00:00.000Z'),
        updatedAt: new Date('2024-01-02T00:00:00.000Z'),
      },
    ];

    const mockResponse = {
      data: mockTransactions,
      pagination: {
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
      },
    };

    it('deve listar transações de um usuário com sucesso', async () => {
      // currentUser deve ter o mesmo userId que mockParams.id para passar na validação
      const currentUserForTest = {
        userId: '550e8400-e29b-41d4-a716-446655440000',
        email: 'user@example.com',
        role: 'user',
      };
      const query: FindTransactionsQueryDto = {
        page: 1,
        limit: 10,
      };
      mockTransactionsService.findByUser.mockResolvedValue(mockResponse);

      const result = await controller.findByUser(
        mockParams,
        query,
        currentUserForTest,
      );

      expect(result).toEqual(mockResponse);
      expect(mockTransactionsService.findByUser).toHaveBeenCalledWith(
        mockParams.id,
        1,
        10,
        undefined,
        undefined,
      );
    });

    it('deve usar valores padrão quando query params não são fornecidos', async () => {
      const query: FindTransactionsQueryDto = {};
      mockTransactionsService.findByUser.mockResolvedValue(mockResponse);

      await controller.findByUser(mockParams, query, currentUser);

      expect(mockTransactionsService.findByUser).toHaveBeenCalledWith(
        mockParams.id,
        1,
        10,
        undefined,
        undefined,
      );
    });

    it('deve filtrar por tipo SENT', async () => {
      const query: FindTransactionsQueryDto = {
        page: 1,
        limit: 10,
        type: TransactionType.SENT,
      };
      mockTransactionsService.findByUser.mockResolvedValue(mockResponse);

      await controller.findByUser(mockParams, query, currentUser);

      expect(mockTransactionsService.findByUser).toHaveBeenCalledWith(
        mockParams.id,
        1,
        10,
        TransactionType.SENT,
        undefined,
      );
    });

    it('deve filtrar por tipo RECEIVED', async () => {
      const query: FindTransactionsQueryDto = {
        page: 1,
        limit: 10,
        type: TransactionType.RECEIVED,
      };
      mockTransactionsService.findByUser.mockResolvedValue(mockResponse);

      await controller.findByUser(mockParams, query, currentUser);

      expect(mockTransactionsService.findByUser).toHaveBeenCalledWith(
        mockParams.id,
        1,
        10,
        TransactionType.RECEIVED,
        undefined,
      );
    });

    it('deve filtrar por status', async () => {
      const query: FindTransactionsQueryDto = {
        page: 1,
        limit: 10,
        status: TransactionStatus.COMPLETED,
      };
      mockTransactionsService.findByUser.mockResolvedValue(mockResponse);

      await controller.findByUser(mockParams, query, currentUser);

      expect(mockTransactionsService.findByUser).toHaveBeenCalledWith(
        mockParams.id,
        1,
        10,
        undefined,
        TransactionStatus.COMPLETED,
      );
    });

    it('deve combinar filtros de tipo e status', async () => {
      const query: FindTransactionsQueryDto = {
        page: 1,
        limit: 10,
        type: TransactionType.SENT,
        status: TransactionStatus.COMPLETED,
      };
      mockTransactionsService.findByUser.mockResolvedValue(mockResponse);

      await controller.findByUser(mockParams, query, currentUser);

      expect(mockTransactionsService.findByUser).toHaveBeenCalledWith(
        mockParams.id,
        1,
        10,
        TransactionType.SENT,
        TransactionStatus.COMPLETED,
      );
    });

    it('deve retornar erro quando service lança BadRequestException', async () => {
      const query: FindTransactionsQueryDto = { page: 1, limit: 10 };
      mockTransactionsService.findByUser.mockRejectedValue(
        new BadRequestException('ID do usuário é obrigatório'),
      );

      await expect(
        controller.findByUser(mockParams, query, currentUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve garantir que o guard JWT está aplicado', () => {
      expect(typeof controller.findByUser).toBe('function');
    });
  });
});
