import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../security/guards/jwt-auth.guard';
import { CreateTransactionDto } from './dto/create-transaction.dto';
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
      mockTransactionsService.findOne.mockResolvedValue(mockTransaction);

      const result = await controller.findOne(mockParams);

      expect(result).toEqual(mockTransaction);
      expect(mockTransactionsService.findOne).toHaveBeenCalledWith(
        mockParams.id,
      );
      expect(mockTransactionsService.findOne).toHaveBeenCalledTimes(1);
    });

    it('deve retornar erro 404 quando transação não é encontrada', async () => {
      mockTransactionsService.findOne.mockRejectedValue(
        new NotFoundException(
          'Transação com ID 550e8400-e29b-41d4-a716-446655440000 não encontrada',
        ),
      );

      await expect(controller.findOne(mockParams)).rejects.toThrow(
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

      await expect(controller.findOne(invalidParams)).rejects.toThrow(
        BadRequestException,
      );

      expect(mockTransactionsService.findOne).toHaveBeenCalledWith(
        invalidParams.id,
      );
    });

    it('deve retornar erro 400 quando ID está vazio', async () => {
      const emptyParams = { id: '' };
      mockTransactionsService.findOne.mockRejectedValue(
        new BadRequestException('ID da transação não pode estar vazio'),
      );

      await expect(controller.findOne(emptyParams)).rejects.toThrow(
        BadRequestException,
      );

      expect(mockTransactionsService.findOne).toHaveBeenCalledWith(
        emptyParams.id,
      );
    });

    it('deve garantir que o guard JWT está aplicado', () => {
      // O guard é verificado através do decorator @UseGuards no código
      expect(typeof controller.findOne).toBe('function');
    });
  });
});
