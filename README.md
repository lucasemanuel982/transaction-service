# Transaction Service

Microsserviço responsável pelo gerenciamento de transações bancárias do sistema.

## Descrição

O Transaction Service é responsável por:
- Criação e gerenciamento de transações entre usuários
- Consulta de transações e histórico
- Gerenciamento de saldo de contas
- Validação de transações
- Integração com User Service para validação de usuários
- Integração com Notification Service para envio de notificações
- Publicação e consumo de eventos via RabbitMQ

## Tecnologias

- NestJS 11
- TypeScript
- PostgreSQL (Prisma ORM)
- RabbitMQ (mensageria)
- JWT (autenticação)
- Swagger/OpenAPI (documentação)
- Axios (comunicação HTTP entre serviços)

## Pré-requisitos

- Node.js 18+
- PostgreSQL
- RabbitMQ
- User Service (para validação de usuários)
- Notification Service (opcional, para notificações)
- npm ou yarn

## Instalação

```bash
npm install
```

## Configuração

Crie um arquivo `.env` na raiz do projeto seguindo o .env.example

## Migrations

### Aplicar migrations manualmente

```bash
psql -U postgres -d transaction_service_db -f migrations/001_initial_transaction_service.sql
psql -U postgres -d transaction_service_db -f migrations/002_add_account_balance.sql
```

### Usar Prisma

```bash
# Gerar Prisma Client
npx prisma generate

# Aplicar migrations
npx prisma migrate deploy

# Visualizar schema no banco
npx prisma studio
```

## Executando o Serviço

### Desenvolvimento

```bash
npm run start:dev
```

### Produção

```bash
npm run build
npm run start:prod
```

### Debug

```bash
npm run start:debug
```

## Documentação da API

Após iniciar o serviço, a documentação Swagger estará disponível em:

```
http://localhost:3002/api/docs
```

## Endpoints Principais

### Transações

- `POST /api/transactions` - Criar nova transferência entre usuários
- `GET /api/transactions/:id` - Buscar detalhes de uma transação específica
- `GET /api/transactions/user/:id` - Listar transações de um usuário (com paginação e filtros)
- `GET /api/transactions/balance/:userId` - Obter saldo de um usuário

## Testes

### Testes unitários

```bash
npm run test
```

### Testes com cobertura

```bash
npm run test:cov
```

### Testes E2E

```bash
npm run test:e2e
```

## Segurança

- Autenticação JWT obrigatória para todos os endpoints
- Validação de entrada com class-validator
- Helmet para proteção contra ataques comuns
- Controle de acesso baseado em roles (admin, manager, user)
- Usuários só podem acessar suas próprias transações (exceto admin/manager)

## Integrações

### User Service

O Transaction Service se comunica com o User Service para:
- Validar existência de usuários antes de criar transações
- Verificar dados bancários dos usuários

### Notification Service

O Transaction Service se comunica com o Notification Service para:
- Enviar notificações quando transações são criadas
- Notificar sobre status de transações

Mais detalhes em `docs/NOTIFICATION_SERVICE_INTEGRATION.md`.

## Mensageria

O serviço:
- Publica eventos no RabbitMQ quando transações são criadas
- Consome eventos do RabbitMQ (ex: atualizações de dados bancários)

## Fluxo de Transação

1. Cliente envia requisição para criar transação
2. Serviço valida token JWT
3. Serviço valida usuários (sender e receiver) com User Service
4. Serviço verifica saldo do remetente
5. Serviço cria transação no banco de dados
6. Serviço atualiza saldos das contas
7. Serviço publica evento no RabbitMQ
8. Serviço envia notificação via Notification Service
9. Retorna resposta ao cliente

## Docker

### Build da imagem

```bash
docker build -t transaction-service .
```

### Executar container

```bash
docker run -p 3002:3002 --env-file .env transaction-service
```

## Scripts Disponíveis

- `npm run build` - Compilar o projeto
- `npm run start` - Iniciar em modo produção
- `npm run start:dev` - Iniciar em modo desenvolvimento com watch
- `npm run start:debug` - Iniciar em modo debug
- `npm run lint` - Executar linter
- `npm run format` - Formatar código com Prettier
- `npm run test` - Executar testes unitários
- `npm run test:watch` - Executar testes em modo watch
- `npm run test:cov` - Executar testes com cobertura
- `npm run test:e2e` - Executar testes E2
