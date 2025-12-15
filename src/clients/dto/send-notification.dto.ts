/**
 * DTO para envio de notificação
 */
export interface SendNotificationDto {
  /**
   * ID do usuário destinatário da notificação
   */
  userId: string;

  /**
   * Tipo da notificação
   */
  type: NotificationType;

  /**
   * Título da notificação
   */
  title: string;

  /**
   * Mensagem da notificação
   */
  message: string;

  /**
   * Dados adicionais relacionados à notificação (opcional)
   */
  metadata?: Record<string, unknown>;

  /**
   * Prioridade da notificação (opcional)
   * @default 'normal'
   */
  priority?: NotificationPriority;
}

/**
 * Tipos de notificação suportados
 */
export enum NotificationType {
  TRANSACTION_COMPLETED = 'transaction.completed',
  TRANSACTION_FAILED = 'transaction.failed',
  ACCOUNT_UPDATE = 'account.update',
  SECURITY_ALERT = 'security.alert',
  SYSTEM_NOTIFICATION = 'system.notification',
}

/**
 * Níveis de prioridade de notificação
 */
export enum NotificationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

/**
 * Resposta do serviço de notificações
 */
export interface NotificationResponse {
  /**
   * ID da notificação criada
   */
  notificationId: string;

  /**
   * Status do envio
   */
  status: 'sent' | 'queued' | 'failed';

  /**
   * Timestamp de quando a notificação foi processada
   */
  timestamp: string;

  /**
   * Mensagem de resposta (opcional)
   */
  message?: string;
}
