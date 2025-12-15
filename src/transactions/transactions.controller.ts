import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionIdParamDto } from './dto/transaction-id-param.dto';
import { UserIdParamDto } from './dto/user-id-param.dto';
import { UserIdBalanceParamDto } from './dto/user-id-balance-param.dto';
import { FindTransactionsQueryDto } from './dto/find-transactions-query.dto';
import { CurrentUser } from '../security/decorators/current-user.decorator';
import { JwtAuthGuard } from '../security/guards/jwt-auth.guard';
import { RolesGuard } from '../security/guards/roles.guard';

@ApiTags('Transactions')
@ApiBearerAuth('JWT-auth')
@Controller('api/transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @ApiOperation({ summary: 'Criar nova transferência entre usuários' })
  @ApiResponse({ status: 201, description: 'Transação criada com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createTransactionDto: CreateTransactionDto,
    @CurrentUser() currentUser: { userId: string; email: string },
    @Req() request: Request,
  ) {
    const authToken = request.headers.authorization?.replace('Bearer ', '');
    return this.transactionsService.create(createTransactionDto, authToken);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar detalhes de uma transação específica' })
  @ApiResponse({ status: 200, description: 'Transação encontrada com sucesso' })
  @ApiResponse({ status: 403, description: 'Acesso negado' })
  @ApiResponse({ status: 404, description: 'Transação não encontrada' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HttpCode(HttpStatus.OK)
  async findOne(
    @Param() params: TransactionIdParamDto,
    @CurrentUser()
    currentUser: { userId: string; email: string; role?: string },
  ) {
    const transaction = await this.transactionsService.findOne(params.id);

    const isOwner =
      transaction.senderUserId === currentUser.userId ||
      transaction.receiverUserId === currentUser.userId;
    const isAdminOrManager =
      currentUser.role === 'admin' || currentUser.role === 'manager';

    if (!isOwner && !isAdminOrManager) {
      throw new ForbiddenException(
        'Você não tem permissão para acessar esta transação',
      );
    }

    return transaction;
  }

  @Get('user/:id')
  @ApiOperation({ summary: 'Listar transações de um usuário' })
  @ApiResponse({ status: 200, description: 'Lista de transações retornada com sucesso' })
  @ApiResponse({ status: 403, description: 'Acesso negado' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HttpCode(HttpStatus.OK)
  async findByUser(
    @Param() params: UserIdParamDto,
    @Query() query: FindTransactionsQueryDto,
    @CurrentUser()
    currentUser: { userId: string; email: string; role?: string },
  ) {
    if (
      params.id !== currentUser.userId &&
      currentUser.role !== 'admin' &&
      currentUser.role !== 'manager'
    ) {
      throw new ForbiddenException(
        'Você não tem permissão para acessar transações de outros usuários',
      );
    }

    return this.transactionsService.findByUser(
      params.id,
      query.page || 1,
      query.limit || 10,
      query.type,
      query.status,
    );
  }

  @Get('balance/:userId')
  @ApiOperation({ summary: 'Obter saldo de um usuário' })
  @ApiResponse({ status: 200, description: 'Saldo retornado com sucesso' })
  @ApiResponse({ status: 403, description: 'Acesso negado' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HttpCode(HttpStatus.OK)
  async getBalance(
    @Param() params: UserIdBalanceParamDto,
    @CurrentUser()
    currentUser: { userId: string; email: string; role?: string },
  ) {
    if (
      params.userId !== currentUser.userId &&
      currentUser.role !== 'admin' &&
      currentUser.role !== 'manager'
    ) {
      throw new ForbiddenException(
        'Você não tem permissão para acessar o saldo de outros usuários',
      );
    }

    return this.transactionsService.getBalance(params.userId);
  }
}
