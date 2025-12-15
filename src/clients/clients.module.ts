import { Module } from '@nestjs/common';
import { UserClientService } from './user-client.service';
import { NotificationClientService } from './notification-client.service';

@Module({
  providers: [UserClientService, NotificationClientService],
  exports: [UserClientService, NotificationClientService],
})
export class ClientsModule {}
