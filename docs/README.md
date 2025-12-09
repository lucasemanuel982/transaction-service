# Documentação - Transaction Service

Este diretório contém a documentação específica do Transaction Service.

## Schemas e Migrations

- `../prisma/schema.prisma` - Schema Prisma do banco de dados
- `../migrations/` - Scripts de migração SQL

## Como Usar

### Aplicar Migrations

```bash
# Aplicar migration manualmente
psql -U postgres -d transaction_service_db -f migrations/001_initial_transaction_service.sql

# Ou usando Prisma
npx prisma migrate deploy
```

### Gerar Prisma Client

```bash
npx prisma generate
```

### Visualizar Schema no Banco

```bash
npx prisma studio
```

## Relacionamentos Externos

O Transaction Service referencia usuários do User Service através de UUIDs:
- `transactions.sender_user_id` → Referência externa ao User Service
- `transactions.receiver_user_id` → Referência externa ao User Service

**Nota:** Não há foreign keys diretas no banco de dados devido à arquitetura de microsserviços. A validação de existência dos usuários deve ser feita via HTTP chamando o User Service.




