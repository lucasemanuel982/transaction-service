import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionIdParamDto } from './dto/transaction-id-param.dto';
import { UserIdParamDto } from './dto/user-id-param.dto';
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
    // Extrai o token do header Authorization para passar ao service
    const authToken = request.headers.authorization?.replace('Bearer ', '');
    return this.transactionsService.create(createTransactionDto, authToken);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param() params: TransactionIdParamDto) {
    return this.transactionsService.findOne(params.id);
  }

  @Get('user/:id')
  @HttpCode(HttpStatus.OK)
  async findByUser(
    @Param() params: UserIdParamDto,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.transactionsService.findByUser(params.id, page, limit);
  }

  @Get('balance/:userId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getBalance(@Param('userId') userId: string) {
    return this.transactionsService.getBalance(userId);
  }
}
