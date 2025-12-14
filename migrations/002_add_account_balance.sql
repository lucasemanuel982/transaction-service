-- Migration: Add Account Balance Table
-- Description: Criação da tabela account_balances para armazenar saldo das contas
-- TABELA: account_balances
CREATE TABLE IF NOT EXISTS account_balances (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR(36) NOT NULL UNIQUE,
    balance DECIMAL(15, 2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Índices para account_balances
CREATE INDEX IF NOT EXISTS idx_account_balances_user_id ON account_balances(user_id);
-- TRIGGER: Atualizar updated_at automaticamente
CREATE TRIGGER update_account_balances_updated_at BEFORE
UPDATE ON account_balances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();