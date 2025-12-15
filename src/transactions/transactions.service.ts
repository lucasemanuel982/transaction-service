import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { UserClientService } from '../clients/user-client.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { EventPublisherService } from '../messaging/event-publisher.service';
import {
  TransactionType,
  TransactionStatus,
} from './dto/find-transactions-query.dto';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly userClient: UserClientService,
    private readonly eventPublisher: EventPublisherService,
  ) {}

  /**
   * Cria uma nova transação
   */
  async create(createTransactionDto: CreateTransactionDto, authToken?: string) {
    const { senderUserId, receiverUserId, amount, description } =
      createTransactionDto;

    if (senderUserId === receiverUserId) {
      throw new BadRequestException(
        'O remetente e o destinatário não podem ser o mesmo usuário',
      );
    }

    if (amount <= 0) {
      throw new BadRequestException(
        'O valor da transação deve ser maior que zero',
      );
    }

    if (description && description.length > 500) {
      throw new BadRequestException(
        'A descrição não pode exceder 500 caracteres',
      );
    }

    try {
      const senderExists = await this.userClient.validateUserExists(
        senderUserId,
        authToken,
      );
      if (!senderExists) {
        throw new NotFoundException(
          `Usuário remetente ${senderUserId} não encontrado`,
        );
      }

      const receiverExists = await this.userClient.validateUserExists(
        receiverUserId,
        authToken,
      );
      if (!receiverExists) {
        throw new NotFoundException(
          `Usuário destinatário ${receiverUserId} não encontrado`,
        );
      }
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error('Erro ao validar usuários:', error);
      throw new InternalServerErrorException(
        'Erro ao validar usuários no microsserviço de Clientes',
      );
    }

    try {
      const transaction = await this.prisma.$transaction(async (tx) => {
        await this.ensureAccountBalanceExists(
          tx as unknown as Parameters<
            typeof this.ensureAccountBalanceExists
          >[0],
          senderUserId,
        );
        await this.ensureAccountBalanceExists(
          tx as unknown as Parameters<
            typeof this.ensureAccountBalanceExists
          >[0],
          receiverUserId,
        );

        const senderBalance = await (
          tx as unknown as {
            accountBalance: {
              findUnique: (args: { where: { userId: string } }) => Promise<{
                userId: string;
                balance: number | string;
              } | null>;
            };
          }
        ).accountBalance.findUnique({
          where: { userId: senderUserId },
        });

        if (!senderBalance) {
          throw new NotFoundException(
            `Saldo não encontrado para usuário ${senderUserId}`,
          );
        }

        const currentBalance = Number(senderBalance.balance);
        if (currentBalance < amount) {
          throw new BadRequestException(
            `Saldo insuficiente. Saldo atual: ${currentBalance.toFixed(2)}, Valor solicitado: ${amount}`,
          );
        }

        const txWithBalance = tx as unknown as {
          accountBalance: {
            update: (args: {
              where: { userId: string };
              data: { balance: { decrement?: number; increment?: number } };
            }) => Promise<{ userId: string; balance: number | string }>;
          };
        };
        await Promise.all([
          txWithBalance.accountBalance.update({
            where: { userId: senderUserId },
            data: { balance: { decrement: amount } },
          }),
          txWithBalance.accountBalance.update({
            where: { userId: receiverUserId },
            data: { balance: { increment: amount } },
          }),
        ]);

        const newTransaction = await tx.transaction.create({
          data: {
            senderUserId,
            receiverUserId,
            amount,
            description: description || null,
            status: 'COMPLETED', // Status inicial como COMPLETED após validações
          },
        });

        return newTransaction;
      });

      this.logger.log(
        `Transação ${transaction.id} criada com sucesso (${senderUserId} -> ${receiverUserId}, valor: ${amount})`,
      );

      try {
        await this.eventPublisher.publishTransactionCompleted(
          transaction.id,
          senderUserId,
          receiverUserId,
          Number(transaction.amount),
        );
        this.logger.log(
          `Evento de notificação publicado para transação ${transaction.id}`,
        );
      } catch (eventError) {
        this.logger.error(
          `Erro ao publicar evento de notificação para transação ${transaction.id}:`,
          eventError,
        );
      }

      return transaction;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error('Erro ao criar transação no banco de dados:', error);
      throw new InternalServerErrorException(
        'Erro ao criar transação no banco de dados',
      );
    }
  }

  /**
   * Busca uma transação por ID
   */
  async findOne(id: string): Promise<{
    id: string;
    senderUserId: string;
    receiverUserId: string;
    amount: number | string;
    description: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }> {
    if (!id || typeof id !== 'string') {
      throw new BadRequestException('ID da transação deve ser uma string');
    }

    const trimmedId = id.trim();
    if (trimmedId === '') {
      throw new BadRequestException('ID da transação não pode estar vazio');
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(trimmedId)) {
      throw new BadRequestException('ID da transação deve ser um UUID válido');
    }

    try {
      const transaction = await this.prisma.transaction.findUnique({
        where: { id: trimmedId },
      });

      if (!transaction) {
        throw new NotFoundException(
          `Transação com ID ${trimmedId} não encontrada`,
        );
      }

      return {
        id: transaction.id,
        senderUserId: transaction.senderUserId,
        receiverUserId: transaction.receiverUserId,
        amount: Number(transaction.amount),
        description: transaction.description,
        status: transaction.status,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error('Erro ao buscar transação:', error);
      throw new InternalServerErrorException('Erro ao buscar transação');
    }
  }

  /**
   * Lista transações de um usuário com paginação e filtros opcionais
   */
  async findByUser(
    userId: string,
    page: number = 1,
    limit: number = 10,
    type?: TransactionType,
    status?: TransactionStatus,
  ): Promise<{
    data: Array<{
      id: string;
      senderUserId: string;
      receiverUserId: string;
      amount: number;
      description: string | null;
      status: string;
      createdAt: Date;
      updatedAt: Date;
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    if (!userId || typeof userId !== 'string') {
      throw new BadRequestException('ID do usuário deve ser uma string');
    }

    const trimmedUserId = userId.trim();
    if (trimmedUserId === '') {
      throw new BadRequestException('ID do usuário não pode estar vazio');
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(trimmedUserId)) {
      throw new BadRequestException('ID do usuário deve ser um UUID válido');
    }

    if (!Number.isInteger(page) || page < 1) {
      throw new BadRequestException(
        'Página deve ser um número inteiro maior que zero',
      );
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException(
        'Limite deve ser um número inteiro entre 1 e 100',
      );
    }

    const skip = (page - 1) * limit;

    const whereConditions: Array<{
      senderUserId?: string;
      receiverUserId?: string;
      status?: string;
    }> = [];

    if (type === TransactionType.SENT) {
      whereConditions.push({ senderUserId: trimmedUserId });
    } else if (type === TransactionType.RECEIVED) {
      whereConditions.push({ receiverUserId: trimmedUserId });
    } else {
      // ALL ou não especificado
      whereConditions.push(
        { senderUserId: trimmedUserId },
        { receiverUserId: trimmedUserId },
      );
    }

    const whereClause: {
      OR: Array<{
        senderUserId?: string;
        receiverUserId?: string;
        status?: string;
      }>;
      status?: string;
    } = {
      OR: whereConditions,
    };

    if (status) {
      whereClause.status = status;
    }

    try {
      const [transactions, total] = await Promise.all([
        this.prisma.transaction.findMany({
          where: whereClause,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.transaction.count({
          where: whereClause,
        }),
      ]);

      // Converter tipos corretamente
      const formattedTransactions = transactions.map((transaction) => ({
        id: transaction.id,
        senderUserId: transaction.senderUserId,
        receiverUserId: transaction.receiverUserId,
        amount: Number(transaction.amount),
        description: transaction.description,
        status: transaction.status,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
      }));

      return {
        data: formattedTransactions,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error('Erro ao listar transações do usuário:', error);
      throw new InternalServerErrorException('Erro ao listar transações');
    }
  }

  /**
   * Garante que uma conta de saldo existe para o usuário
   * Cria com saldo inicial 0 se não existir
   */
  private async ensureAccountBalanceExists(
    tx: {
      accountBalance: {
        findUnique: (args: { where: { userId: string } }) => Promise<{
          userId: string;
          balance: number | string;
        } | null>;
        create: (args: {
          data: { userId: string; balance: number };
        }) => Promise<{ userId: string; balance: number | string }>;
      };
    },
    userId: string,
  ): Promise<void> {
    const existingBalance = await tx.accountBalance.findUnique({
      where: { userId },
    });

    if (!existingBalance) {
      await tx.accountBalance.create({
        data: {
          userId,
          balance: 0,
        },
      });
      this.logger.log(
        `Conta de saldo criada para usuário ${userId} com saldo inicial 0`,
      );
    }
  }

  /**
   * Busca o saldo de um usuário
   */
  async getBalance(
    userId: string,
  ): Promise<{ userId: string; balance: number }> {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      throw new BadRequestException('ID do usuário é obrigatório');
    }

    const trimmedUserId = userId.trim();
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(trimmedUserId)) {
      throw new BadRequestException('ID do usuário deve ser um UUID válido');
    }

    try {
      const prismaWithBalance = this.prisma as unknown as {
        accountBalance: {
          findUnique: (args: {
            where: { userId: string };
          }) => Promise<{ userId: string; balance: number | string } | null>;
          create: (args: {
            data: { userId: string; balance: number };
          }) => Promise<{ userId: string; balance: number | string }>;
        };
      };

      let accountBalance = await prismaWithBalance.accountBalance.findUnique({
        where: { userId: trimmedUserId },
      });

      if (!accountBalance) {
        accountBalance = await prismaWithBalance.accountBalance.create({
          data: {
            userId: trimmedUserId,
            balance: 0,
          },
        });
        this.logger.log(
          `Conta de saldo criada para usuário ${trimmedUserId} com saldo inicial 0`,
        );
      }

      return {
        userId: accountBalance.userId,
        balance: Number(accountBalance.balance),
      };
    } catch (error) {
      this.logger.error(`Erro ao buscar saldo do usuário ${userId}:`, error);
      throw new InternalServerErrorException('Erro ao buscar saldo');
    }
  }
}
