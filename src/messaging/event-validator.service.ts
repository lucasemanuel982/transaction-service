import { Injectable, Logger } from '@nestjs/common';
import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as path from 'path';
import {
  BankingDetailsUpdatedEvent,
  TransactionCompletedEvent,
  TransactionFailedEvent,
} from './interfaces/events.interface';

@Injectable()
export class EventValidatorService {
  private readonly logger = new Logger(EventValidatorService.name);
  private readonly ajv: Ajv;
  private readonly validators: {
    bankingDetailsUpdated: ValidateFunction;
    transactionCompleted: ValidateFunction;
    transactionFailed: ValidateFunction;
  };

  constructor() {
    this.ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(this.ajv);

    const schemasPath = path.join(
      __dirname,
      '../../../../docs/schemas/event-schemas.json',
    );
    const eventSchemas = JSON.parse(fs.readFileSync(schemasPath, 'utf-8')) as {
      definitions: {
        BankingDetailsUpdatedEvent: Record<string, unknown>;
        TransactionCompletedEvent: Record<string, unknown>;
        TransactionFailedEvent: Record<string, unknown>;
      };
    };

    this.validators = {
      bankingDetailsUpdated: this.ajv.compile(
        eventSchemas.definitions.BankingDetailsUpdatedEvent as never,
      ),
      transactionCompleted: this.ajv.compile(
        eventSchemas.definitions.TransactionCompletedEvent as never,
      ),
      transactionFailed: this.ajv.compile(
        eventSchemas.definitions.TransactionFailedEvent as never,
      ),
    };
  }

  /**
   * Valida evento de atualização de dados bancários
   */
  validateBankingDetailsUpdated(
    event: unknown,
  ): event is BankingDetailsUpdatedEvent {
    const valid = this.validators.bankingDetailsUpdated(event);
    if (!valid) {
      this.logger.error(
        'Evento banking-details.updated inválido:',
        this.validators.bankingDetailsUpdated.errors,
      );
    }
    return valid;
  }

  /**
   * Valida evento de transação concluída
   */
  validateTransactionCompleted(
    event: unknown,
  ): event is TransactionCompletedEvent {
    const valid = this.validators.transactionCompleted(event);
    if (!valid) {
      this.logger.error(
        'Evento transaction.completed inválido:',
        this.validators.transactionCompleted.errors,
      );
    }
    return valid;
  }

  /**
   * Valida evento de transação falhada
   */
  validateTransactionFailed(event: unknown): event is TransactionFailedEvent {
    const valid = this.validators.transactionFailed(event);
    if (!valid) {
      this.logger.error(
        'Evento transaction.failed inválido:',
        this.validators.transactionFailed.errors,
      );
    }
    return valid;
  }

  /**
   * Valida qualquer evento baseado no tipo
   */
  validateEvent(
    eventType:
      | 'banking-details.updated'
      | 'transaction.completed'
      | 'transaction.failed',
    event: unknown,
  ): boolean {
    switch (eventType) {
      case 'banking-details.updated':
        return this.validateBankingDetailsUpdated(event);
      case 'transaction.completed':
        return this.validateTransactionCompleted(event);
      case 'transaction.failed':
        return this.validateTransactionFailed(event);
      default:
        this.logger.error(`Tipo de evento desconhecido: ${String(eventType)}`);
        return false;
    }
  }
}
