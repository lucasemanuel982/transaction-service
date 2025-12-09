/**
 * Interfaces para eventos de mensageria
 */

export interface BankingDetailsUpdatedEvent {
  eventId: string;
  userId: string;
  bankingDetails: {
    agency: string;
    account: string;
  };
  timestamp: string;
  source: string;
}

export interface TransactionCompletedEvent {
  eventId: string;
  transactionId: string;
  senderUserId: string;
  receiverUserId: string;
  amount: number;
  timestamp: string;
  source: string;
}

export interface TransactionFailedEvent {
  eventId: string;
  transactionId: string;
  reason: string;
  timestamp: string;
  source: string;
}

export interface BaseEvent {
  eventId: string;
  timestamp: string;
  source: string;
}
