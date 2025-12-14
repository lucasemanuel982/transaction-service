import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { INotificationClient } from './interfaces/notification-client.interface';
import {
  SendNotificationDto,
  NotificationResponse,
  NotificationType,
  NotificationPriority,
} from './dto/send-notification.dto';
import { randomUUID } from 'crypto';

/**
 * Serviço cliente para comunicação com o microsserviço de notificações
 *
 * Esta é uma implementação simulada do cliente de notificações, já que o
 * microsserviço de notificações é abstrato e não possui implementação real.
 *
 * Em produção, este serviço faria chamadas HTTP reais para o microsserviço
 * de notificações. A implementação atual simula essas chamadas para permitir
 * desenvolvimento e testes sem depender de um serviço real.
 */
@Injectable()
export class NotificationClientService implements INotificationClient {
  private readonly logger = new Logger(NotificationClientService.name);
  private readonly baseUrl: string;
  private readonly timeout: number = 5000; // 5 segundos

  constructor() {
    // Em produção, isso viria de variáveis de ambiente
    this.baseUrl =
      process.env.NOTIFICATION_SERVICE_URL ||
      'http://notification-service:3003';
    this.logger.log(
      `NotificationClientService inicializado. Base URL: ${this.baseUrl} (simulado)`,
    );
  }

  /**
   * Envia uma notificação genérica para um usuário
   *
   * @param notification Dados da notificação a ser enviada
   * @param authToken Token JWT para autenticação (opcional)
   * @returns Promise com a resposta do serviço de notificações
   * @throws HttpException em caso de erro na comunicação
   */
  async sendNotification(
    notification: SendNotificationDto,
    authToken?: string,
  ): Promise<NotificationResponse> {
    this.logger.debug(
      `Enviando notificação para usuário ${notification.userId}`,
      { notification, hasAuthToken: !!authToken },
    );

    // Validação básica
    this.validateNotification(notification);

    try {
      // Simulação de chamada HTTP
      // Em produção, isso seria: await axios.post(...)
      const response = await this.simulateHttpCall(notification, authToken);

      this.logger.log(
        `Notificação enviada com sucesso. ID: ${response.notificationId}`,
      );

      return response;
    } catch (error) {
      this.logger.error('Erro ao enviar notificação:', error);
      throw new HttpException(
        'Erro ao comunicar com o serviço de notificações',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

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
  async sendTransactionCompletedNotification(
    userId: string,
    transactionId: string,
    amount: number,
    isSender: boolean,
    authToken?: string,
  ): Promise<NotificationResponse> {
    const title = isSender
      ? 'Transferência realizada'
      : 'Transferência recebida';
    const message = isSender
      ? `Você transferiu R$ ${amount.toFixed(2)} para outro usuário.`
      : `Você recebeu R$ ${amount.toFixed(2)} de outro usuário.`;

    const notification: SendNotificationDto = {
      userId,
      type: NotificationType.TRANSACTION_COMPLETED,
      title,
      message,
      priority: NotificationPriority.HIGH,
      metadata: {
        transactionId,
        amount,
        isSender,
        timestamp: new Date().toISOString(),
      },
    };

    return this.sendNotification(notification, authToken);
  }

  /**
   * Envia notificação de transação falhada
   *
   * @param userId ID do usuário destinatário
   * @param transactionId ID da transação
   * @param reason Motivo da falha
   * @param authToken Token JWT para autenticação (opcional)
   * @returns Promise com a resposta do serviço de notificações
   */
  async sendTransactionFailedNotification(
    userId: string,
    transactionId: string,
    reason: string,
    authToken?: string,
  ): Promise<NotificationResponse> {
    const notification: SendNotificationDto = {
      userId,
      type: NotificationType.TRANSACTION_FAILED,
      title: 'Transferência não realizada',
      message: `A transferência não pôde ser concluída: ${reason}`,
      priority: NotificationPriority.URGENT,
      metadata: {
        transactionId,
        reason,
        timestamp: new Date().toISOString(),
      },
    };

    return this.sendNotification(notification, authToken);
  }

  /**
   * Valida os dados da notificação antes de enviar
   */
  private validateNotification(notification: SendNotificationDto): void {
    if (!notification.userId || notification.userId.trim() === '') {
      throw new HttpException('userId é obrigatório', HttpStatus.BAD_REQUEST);
    }

    if (!notification.type) {
      throw new HttpException('type é obrigatório', HttpStatus.BAD_REQUEST);
    }

    if (!notification.title || notification.title.trim() === '') {
      throw new HttpException('title é obrigatório', HttpStatus.BAD_REQUEST);
    }

    if (!notification.message || notification.message.trim() === '') {
      throw new HttpException('message é obrigatório', HttpStatus.BAD_REQUEST);
    }

    // Validação de UUID
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(notification.userId)) {
      throw new HttpException(
        'userId deve ser um UUID válido',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Simula uma chamada HTTP para o serviço de notificações
   *
   * Em produção, isso seria substituído por uma chamada real usando axios ou similar
   */
  private async simulateHttpCall(
    notification: SendNotificationDto,
    authToken?: string,
  ): Promise<NotificationResponse> {
    // Simula delay de rede
    await this.simulateNetworkDelay();

    // Simula validação de autenticação
    if (authToken) {
      // Em produção, o token seria validado pelo serviço de notificações
      this.logger.debug('Token de autenticação fornecido (simulado)');
    }

    // Simula resposta bem-sucedida
    const response: NotificationResponse = {
      notificationId: randomUUID(),
      status: 'sent',
      timestamp: new Date().toISOString(),
      message: 'Notificação enviada com sucesso (simulado)',
    };

    // Simula ocasional falha (5% de chance) para testes de resiliência
    if (Math.random() < 0.05) {
      this.logger.warn('Simulando falha na comunicação (5% de chance)');
      throw new Error('Simulated network error');
    }

    return response;
  }

  /**
   * Simula delay de rede (50-200ms)
   */
  private async simulateNetworkDelay(): Promise<void> {
    const delay = Math.floor(Math.random() * 150) + 50; // 50-200ms
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Verifica se o serviço de notificações está disponível
   * (Método útil para health checks)
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Em produção, isso faria uma chamada GET /health
      // Por enquanto, simula um delay de rede e sempre retorna true
      await this.simulateNetworkDelay();
      return true;
    } catch (error) {
      this.logger.error(
        'Health check do serviço de notificações falhou:',
        error,
      );
      return false;
    }
  }
}
