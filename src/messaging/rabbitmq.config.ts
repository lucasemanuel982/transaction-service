/**
 * Configuração do RabbitMQ
 */

export const RABBITMQ_CONFIG = {
  // Exchange principal para eventos do sistema bancário
  EXCHANGE: {
    NAME: 'banking.events',
    TYPE: 'topic',
    OPTIONS: {
      durable: true, // Persiste após reinicialização do broker
    },
  },

  // Queues
  QUEUES: {
    BANKING_DETAILS_UPDATED: 'user.banking-details.updated',
    TRANSACTION_COMPLETED: 'transaction.completed',
    TRANSACTION_FAILED: 'transaction.failed',
  },

  // Routing keys
  ROUTING_KEYS: {
    BANKING_DETAILS_UPDATED: 'user.banking-details.updated',
    TRANSACTION_COMPLETED: 'transaction.completed',
    TRANSACTION_FAILED: 'transaction.failed',
  },

  // Opções de publicação
  PUBLISH_OPTIONS: {
    persistent: true, // Mensagens persistem em disco
  },

  // Opções de consumo
  CONSUME_OPTIONS: {
    noAck: false, // Requer confirmação manual (ack)
  },
};
