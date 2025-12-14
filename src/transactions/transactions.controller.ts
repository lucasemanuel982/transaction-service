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
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionIdParamDto } from './dto/transaction-id-param.dto';
import { UserIdParamDto } from './dto/user-id-param.dto';
import { CurrentUser } from '../security/decorators/current-user.decorator';

@Controller('api/transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createTransactionDto: CreateTransactionDto,
    @CurrentUser() currentUser?: { userId: string; email: string },
  ) {
    return this.transactionsService.create(createTransactionDto);
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
}
