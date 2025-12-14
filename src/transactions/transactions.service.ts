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
  async findOne(id: string) {
    if (!id || typeof id !== 'string' || id.trim() === '') {
      throw new NotFoundException('ID da transação é obrigatório');
    }

    try {
      const transaction = await this.prisma.transaction.findUnique({
        where: { id },
      });

      if (!transaction) {
        throw new NotFoundException(`Transação com ID ${id} não encontrada`);
      }

      return transaction;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error('Erro ao buscar transação:', error);
      throw new InternalServerErrorException('Erro ao buscar transação');
    }
  }

  /**
   * Lista transações de um usuário
   */
  async findByUser(userId: string, page = 1, limit = 10) {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      throw new BadRequestException('ID do usuário é obrigatório');
    }

    const skip = (page - 1) * limit;

    try {
      const [transactions, total] = await Promise.all([
        this.prisma.transaction.findMany({
          where: {
            OR: [{ senderUserId: userId }, { receiverUserId: userId }],
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.transaction.count({
          where: {
            OR: [{ senderUserId: userId }, { receiverUserId: userId }],
          },
        }),
      ]);

      return {
        data: transactions,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
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
        where: { userId },
      });

      if (!accountBalance) {
        accountBalance = await prismaWithBalance.accountBalance.create({
          data: {
            userId,
            balance: 0,
          },
        });
        this.logger.log(
          `Conta de saldo criada para usuário ${userId} com saldo inicial 0`,
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
