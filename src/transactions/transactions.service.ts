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
   * Valida usuários e cria registro no banco
   */
  async create(createTransactionDto: CreateTransactionDto, authToken?: string) {
    const { senderUserId, receiverUserId, amount, description } =
      createTransactionDto;

    if (senderUserId === receiverUserId) {
      throw new BadRequestException(
        'O remetente e o destinatário não podem ser o mesmo usuário',
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
      const transaction = await this.prisma.transaction.create({
        data: {
          senderUserId,
          receiverUserId,
          amount,
          description: description || null,
          status: 'PENDING',
        },
      });

      this.logger.log(
        `Transação ${transaction.id} criada com sucesso (${senderUserId} -> ${receiverUserId})`,
      );

      return transaction;
    } catch (error) {
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
}
