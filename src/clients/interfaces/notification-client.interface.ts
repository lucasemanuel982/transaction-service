import {
  SendNotificationDto,
  NotificationResponse,
} from '../dto/send-notification.dto';

/**
 * Interface para o cliente de comunicação com o microsserviço de notificações
 *
 * Esta interface define o contrato que deve ser implementado para comunicação
 * com o microsserviço de notificações. Como o serviço é abstrato, a implementação
 * atual simula as chamadas HTTP.
 */
export interface INotificationClient {
  /**
   * Envia uma notificação para um usuário
   *
   * @param notification Dados da notificação a ser enviada
   * @param authToken Token JWT para autenticação (opcional)
   * @returns Promise com a resposta do serviço de notificações
   * @throws HttpException em caso de erro na comunicação
   */
  sendNotification(
    notification: SendNotificationDto,
    authToken?: string,
  ): Promise<NotificationResponse>;

  /**
   * Envia notificação de transação concluída
   *
   * @param userId ID do usuário destinatário
   * @param transactionId ID da transação
   * @param amount Valor da transação
   * @param isSender Indica se o usuário é o remetente (true) ou destinatário (false)
   * @param authToken Token JWT para autenticação (opcional)
   * @returns Promise com a resposta do serviço de notificações
   */
  sendTransactionCompletedNotification(
    userId: string,
    transactionId: string,
    amount: number,
    isSender: boolean,
    authToken?: string,
  ): Promise<NotificationResponse>;

  /**
   * Envia notificação de transação falhada
   *
   * @param userId ID do usuário destinatário
   * @param transactionId ID da transação
   * @param reason Motivo da falha
   * @param authToken Token JWT para autenticação (opcional)
   * @returns Promise com a resposta do serviço de notificações
   */
  sendTransactionFailedNotification(
    userId: string,
    transactionId: string,
    reason: string,
    authToken?: string,
  ): Promise<NotificationResponse>;
}
