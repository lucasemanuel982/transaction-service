import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { ClientsModule } from '../clients/clients.module';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [ClientsModule, MessagingModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}


