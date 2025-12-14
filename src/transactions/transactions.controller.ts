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
} from '@nestjs/common';
import type { Request } from 'express';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionIdParamDto } from './dto/transaction-id-param.dto';
import { UserIdParamDto } from './dto/user-id-param.dto';
import { FindTransactionsQueryDto } from './dto/find-transactions-query.dto';
import { CurrentUser } from '../security/decorators/current-user.decorator';
import { JwtAuthGuard } from '../security/guards/jwt-auth.guard';

@Controller('api/transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
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
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async findOne(@Param() params: TransactionIdParamDto) {
    return this.transactionsService.findOne(params.id);
  }

  @Get('user/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async findByUser(
    @Param() params: UserIdParamDto,
    @Query() query: FindTransactionsQueryDto,
  ) {
    return this.transactionsService.findByUser(
      params.id,
      query.page || 1,
      query.limit || 10,
      query.type,
      query.status,
    );
  }

  @Get('balance/:userId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getBalance(@Param('userId') userId: string) {
    return this.transactionsService.getBalance(userId);
  }
}
