import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtModule } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { UserClientService } from '../src/clients/user-client.service';
import { EventPublisherService } from '../src/messaging/event-publisher.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';

// Tipos para respostas da API
interface TransactionResponse {
  id: string;
  senderUserId: string;
  receiverUserId: string;
  amount: number | string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface BalanceResponse {
  userId: string;
  balance: number;
}

interface TransactionsListResponse {
  data: TransactionResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

describe('Transactions Integration Tests (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userClientService: UserClientService;
  let eventPublisherService: EventPublisherService;
  let jwtService: JwtService;

  // Helper para obter o servidor HTTP tipado corretamente
  const getHttpServer = () => {
    return request(
      app.getHttpServer() as unknown as Parameters<typeof request>[0],
    );
  };

  // IDs de teste
  const senderUserId = '550e8400-e29b-41d4-a716-446655440001';
  const receiverUserId = '550e8400-e29b-41d4-a716-446655440002';
  const invalidUserId = '550e8400-e29b-41d4-a716-446655440003';

  // Helper para gerar token JWT válido (será definido após beforeAll)
  let generateJwtToken: (userId: string, email: string) => string;

  beforeAll(async () => {
    // Configurar variáveis de ambiente para testes
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL =
        'postgresql://transaction_service:transaction_service_pass@localhost:5433/transaction_service_db';
    }
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = 'test-secret-key-for-integration-tests';
    }
    if (!process.env.USER_SERVICE_URL) {
      process.env.USER_SERVICE_URL = 'http://localhost:3001';
    }
    if (!process.env.RABBITMQ_URL) {
      process.env.RABBITMQ_URL = 'amqp://admin:admin123@localhost:5672/';
    }

    // Criar tabelas se não existirem (executar migrations)
    const tempPrisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });
    try {
      await tempPrisma.$connect();

      // Criar função para atualizar updated_at se não existir
      await tempPrisma.$executeRawUnsafe(
        `CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END; $$ language 'plpgsql';`,
      );

      // Criar tabela transactions se não existir
      await tempPrisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS transactions (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text, sender_user_id VARCHAR(36) NOT NULL, receiver_user_id VARCHAR(36) NOT NULL, amount DECIMAL(15, 2) NOT NULL, description VARCHAR(500), status VARCHAR(50) NOT NULL DEFAULT 'PENDING', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
      );

      // Criar índices para transactions (um por vez)
      await tempPrisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS idx_transactions_sender_user_id ON transactions(sender_user_id);`,
      );
      await tempPrisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS idx_transactions_receiver_user_id ON transactions(receiver_user_id);`,
      );
      await tempPrisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);`,
      );
      await tempPrisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);`,
      );

      // Criar tabela account_balances se não existir
      await tempPrisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS account_balances (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text, user_id VARCHAR(36) NOT NULL UNIQUE, balance DECIMAL(15, 2) NOT NULL DEFAULT 0 CHECK (balance >= 0), created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
      );

      // Criar índice para account_balances
      await tempPrisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS idx_account_balances_user_id ON account_balances(user_id);`,
      );

      // Criar trigger para account_balances se não existir
      await tempPrisma.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS update_account_balances_updated_at ON account_balances;`,
      );
      await tempPrisma.$executeRawUnsafe(
        `CREATE TRIGGER update_account_balances_updated_at BEFORE UPDATE ON account_balances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`,
      );

      await tempPrisma.$disconnect();
    } catch (error) {
      console.warn('Erro ao criar tabelas (podem já existir):', error);
      try {
        await tempPrisma.$disconnect();
      } catch {
        // Ignorar erro de desconexão
      }
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        AppModule,
        JwtModule.register({
          secret: process.env.JWT_SECRET || 'test-secret',
        }),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Aplicar ValidationPipe globalmente
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    userClientService = moduleFixture.get<UserClientService>(UserClientService);
    eventPublisherService = moduleFixture.get<EventPublisherService>(
      EventPublisherService,
    );
    jwtService = moduleFixture.get<JwtService>(JwtService);

    // Definir helper de geração de token após jwtService estar disponível
    generateJwtToken = (userId: string, email: string): string => {
      return jwtService.sign(
        {
          sub: userId,
          email: email,
          jti: 'test-jti',
        },
        {
          secret: process.env.JWT_SECRET || 'test-secret',
          expiresIn: '1h',
        },
      );
    };
  });

  beforeEach(async () => {
    // Limpar banco de dados antes de cada teste
    await prisma.transaction.deleteMany({});
    const prismaWithBalance = prisma as unknown as {
      accountBalance: {
        deleteMany: () => Promise<unknown>;
        createMany: (args: {
          data: Array<{ userId: string; balance: number }>;
        }) => Promise<unknown>;
      };
    };
    await prismaWithBalance.accountBalance.deleteMany();

    // Criar saldos iniciais para os usuários de teste
    await prismaWithBalance.accountBalance.createMany({
      data: [
        {
          userId: senderUserId,
          balance: 1000.0,
        },
        {
          userId: receiverUserId,
          balance: 500.0,
        },
      ],
    });

    // Mock do UserClientService para validar usuários
    jest
      .spyOn(userClientService, 'validateUserExists')
      .mockImplementation((userId: string): Promise<boolean> => {
        return Promise.resolve(
          userId === senderUserId ||
            userId === receiverUserId ||
            userId === invalidUserId,
        );
      });

    // Mock do EventPublisherService para verificar publicação de eventos
    jest
      .spyOn(eventPublisherService, 'publishTransactionCompleted')
      .mockResolvedValue(undefined);
  });

  afterAll(async () => {
    // Limpar banco de dados após todos os testes
    await prisma.transaction.deleteMany({});
    const prismaWithBalance = prisma as unknown as {
      accountBalance: {
        deleteMany: () => Promise<unknown>;
      };
    };
    await prismaWithBalance.accountBalance.deleteMany();
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /api/transactions', () => {
    it('deve criar uma transação com sucesso', async () => {
      const validToken = generateJwtToken(senderUserId, 'sender@test.com');
      const createTransactionDto = {
        senderUserId,
        receiverUserId,
        amount: 100.5,
        description: 'Test transaction',
      };

      const response = await getHttpServer()
        .post('/api/transactions')
        .set('Authorization', `Bearer ${validToken}`)
        .send(createTransactionDto)
        .expect(201);

      const transactionBody = response.body as TransactionResponse;
      expect(transactionBody).toHaveProperty('id');
      expect(transactionBody.senderUserId).toBe(senderUserId);
      expect(transactionBody.receiverUserId).toBe(receiverUserId);
      expect(Number(transactionBody.amount)).toBe(100.5);
      expect(transactionBody.status).toBe('COMPLETED');

      // Verificar se o evento foi publicado
      const publishSpy = jest.spyOn(
        eventPublisherService,
        'publishTransactionCompleted',
      );
      expect(publishSpy).toHaveBeenCalledWith(
        transactionBody.id,
        senderUserId,
        receiverUserId,
        100.5,
      );

      // Verificar se os saldos foram atualizados no banco
      const prismaWithBalance = prisma as unknown as {
        accountBalance: {
          findUnique: (args: {
            where: { userId: string };
          }) => Promise<{ userId: string; balance: number | string } | null>;
        };
      };
      const senderBalance = await prismaWithBalance.accountBalance.findUnique({
        where: { userId: senderUserId },
      });
      const receiverBalance = await prismaWithBalance.accountBalance.findUnique(
        {
          where: { userId: receiverUserId },
        },
      );

      expect(Number(senderBalance?.balance)).toBe(899.5);
      expect(Number(receiverBalance?.balance)).toBe(600.5);
    });

    it('deve retornar 401 quando token não é fornecido', async () => {
      const createTransactionDto = {
        senderUserId,
        receiverUserId,
        amount: 100.5,
      };

      await getHttpServer()
        .post('/api/transactions')
        .send(createTransactionDto)
        .expect(401);
    });

    it('deve retornar 400 quando senderUserId e receiverUserId são iguais', async () => {
      const validToken = generateJwtToken(senderUserId, 'sender@test.com');
      const createTransactionDto = {
        senderUserId,
        receiverUserId: senderUserId,
        amount: 100.5,
      };

      await getHttpServer()
        .post('/api/transactions')
        .set('Authorization', `Bearer ${validToken}`)
        .send(createTransactionDto)
        .expect(400);
    });

    it('deve retornar 400 quando amount é menor ou igual a zero', async () => {
      const validToken = generateJwtToken(senderUserId, 'sender@test.com');
      const createTransactionDto = {
        senderUserId,
        receiverUserId,
        amount: 0,
      };

      await getHttpServer()
        .post('/api/transactions')
        .set('Authorization', `Bearer ${validToken}`)
        .send(createTransactionDto)
        .expect(400);
    });

    it('deve retornar 400 quando saldo é insuficiente', async () => {
      const validToken = generateJwtToken(senderUserId, 'sender@test.com');
      const createTransactionDto = {
        senderUserId,
        receiverUserId,
        amount: 2000.0, // Maior que o saldo disponível (1000.0)
      };

      await getHttpServer()
        .post('/api/transactions')
        .set('Authorization', `Bearer ${validToken}`)
        .send(createTransactionDto)
        .expect(400);
    });

    it('deve retornar 404 quando senderUserId não existe', async () => {
      const validToken = generateJwtToken(senderUserId, 'sender@test.com');
      jest
        .spyOn(userClientService, 'validateUserExists')
        .mockResolvedValueOnce(false);

      const createTransactionDto = {
        senderUserId: '550e8400-e29b-41d4-a716-446655440999',
        receiverUserId,
        amount: 100.5,
      };

      await getHttpServer()
        .post('/api/transactions')
        .set('Authorization', `Bearer ${validToken}`)
        .send(createTransactionDto)
        .expect(404);
    });
  });

  describe('GET /api/transactions/:id', () => {
    let transactionId: string;
    let validToken: string;

    beforeEach(async () => {
      validToken = generateJwtToken(senderUserId, 'sender@test.com');
      // Criar uma transação de teste
      const transaction = await prisma.transaction.create({
        data: {
          senderUserId,
          receiverUserId,
          amount: 50.0,
          description: 'Test transaction for GET',
          status: 'COMPLETED',
        },
      });
      transactionId = transaction.id;
    });

    it('deve retornar uma transação específica com sucesso', async () => {
      const response = await getHttpServer()
        .get(`/api/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      const body = response.body as TransactionResponse;
      expect(body.id).toBe(transactionId);
      expect(body.senderUserId).toBe(senderUserId);
      expect(body.receiverUserId).toBe(receiverUserId);
      expect(Number(body.amount)).toBe(50.0);
    });

    it('deve retornar 401 quando token não é fornecido', async () => {
      await getHttpServer()
        .get(`/api/transactions/${transactionId}`)
        .expect(401);
    });

    it('deve retornar 404 quando transação não existe', async () => {
      const nonExistentId = '550e8400-e29b-41d4-a716-446655440999';

      await getHttpServer()
        .get(`/api/transactions/${nonExistentId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404);
    });

    it('deve retornar 400 quando ID não é um UUID válido', async () => {
      await getHttpServer()
        .get('/api/transactions/invalid-id')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(400);
    });
  });

  describe('GET /api/transactions/user/:id', () => {
    let validToken: string;

    beforeEach(async () => {
      validToken = generateJwtToken(senderUserId, 'sender@test.com');
      // Criar múltiplas transações para testar paginação e filtros
      await prisma.transaction.createMany({
        data: [
          {
            senderUserId,
            receiverUserId,
            amount: 10.0,
            description: 'Transaction 1',
            status: 'COMPLETED',
          },
          {
            senderUserId,
            receiverUserId,
            amount: 20.0,
            description: 'Transaction 2',
            status: 'PENDING',
          },
          {
            senderUserId: receiverUserId,
            receiverUserId: senderUserId,
            amount: 30.0,
            description: 'Transaction 3',
            status: 'COMPLETED',
          },
        ],
      });
    });

    it('deve listar transações de um usuário com sucesso', async () => {
      const response = await getHttpServer()
        .get(`/api/transactions/user/${senderUserId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      const listBody = response.body as TransactionsListResponse;
      expect(listBody).toHaveProperty('data');
      expect(listBody).toHaveProperty('pagination');
      expect(Array.isArray(listBody.data)).toBe(true);
      expect(listBody.pagination.page).toBe(1);
      expect(listBody.pagination.limit).toBe(10);
    });

    it('deve aplicar paginação corretamente', async () => {
      const response = await getHttpServer()
        .get(`/api/transactions/user/${senderUserId}?page=1&limit=2`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      const body = response.body as TransactionsListResponse;
      expect(body.data).toHaveLength(2);
      expect(body.pagination.limit).toBe(2);
    });

    it('deve filtrar por tipo SENT', async () => {
      const response = await getHttpServer()
        .get(`/api/transactions/user/${senderUserId}?type=sent`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      const body = response.body as TransactionsListResponse;
      body.data.forEach((transaction) => {
        expect(transaction.senderUserId).toBe(senderUserId);
      });
    });

    it('deve filtrar por tipo RECEIVED', async () => {
      const response = await getHttpServer()
        .get(`/api/transactions/user/${senderUserId}?type=received`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      const body = response.body as TransactionsListResponse;
      body.data.forEach((transaction) => {
        expect(transaction.receiverUserId).toBe(senderUserId);
      });
    });

    it('deve filtrar por status', async () => {
      const response = await getHttpServer()
        .get(`/api/transactions/user/${senderUserId}?status=COMPLETED`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      const body = response.body as TransactionsListResponse;
      body.data.forEach((transaction) => {
        expect(transaction.status).toBe('COMPLETED');
      });
    });

    it('deve retornar 401 quando token não é fornecido', async () => {
      await getHttpServer()
        .get(`/api/transactions/user/${senderUserId}`)
        .expect(401);
    });

    it('deve retornar 400 quando userId não é um UUID válido', async () => {
      const validToken = generateJwtToken(senderUserId, 'sender@test.com');
      await getHttpServer()
        .get('/api/transactions/user/invalid-id')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(400);
    });
  });

  describe('GET /api/transactions/balance/:userId', () => {
    it('deve retornar o saldo do usuário com sucesso', async () => {
      const validToken = generateJwtToken(senderUserId, 'sender@test.com');
      const response = await getHttpServer()
        .get(`/api/transactions/balance/${senderUserId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      const balanceBody = response.body as BalanceResponse;
      expect(balanceBody).toHaveProperty('userId');
      expect(balanceBody).toHaveProperty('balance');
      expect(balanceBody.userId).toBe(senderUserId);
      expect(typeof balanceBody.balance).toBe('number');
    });

    it('deve criar saldo com valor 0 se não existir', async () => {
      const newUserId = '550e8400-e29b-41d4-a716-446655440999';
      const newUserToken = generateJwtToken(newUserId, 'newuser@test.com');

      const response = await getHttpServer()
        .get(`/api/transactions/balance/${newUserId}`)
        .set('Authorization', `Bearer ${newUserToken}`)
        .expect(200);

      const body = response.body as BalanceResponse;
      expect(body.balance).toBe(0);

      // Verificar se foi criado no banco
      const prismaWithBalance = prisma as unknown as {
        accountBalance: {
          findUnique: (args: {
            where: { userId: string };
          }) => Promise<{ userId: string; balance: number | string } | null>;
        };
      };
      const balance = await prismaWithBalance.accountBalance.findUnique({
        where: { userId: newUserId },
      });
      expect(balance).not.toBeNull();
      expect(Number(balance?.balance)).toBe(0);
    });

    it('deve retornar 401 quando token não é fornecido', async () => {
      await getHttpServer()
        .get(`/api/transactions/balance/${senderUserId}`)
        .expect(401);
    });

    it('deve retornar 400 quando userId não é um UUID válido', async () => {
      const validToken = generateJwtToken(senderUserId, 'sender@test.com');
      await getHttpServer()
        .get('/api/transactions/balance/invalid-id')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(400);
    });
  });

  describe('Integração com PostgreSQL', () => {
    it('deve persistir transação no banco de dados', async () => {
      const validToken = generateJwtToken(senderUserId, 'sender@test.com');
      const createTransactionDto = {
        senderUserId,
        receiverUserId,
        amount: 25.0,
        description: 'Database integration test',
      };

      const response = await getHttpServer()
        .post('/api/transactions')
        .set('Authorization', `Bearer ${validToken}`)
        .send(createTransactionDto)
        .expect(201);

      // Verificar diretamente no banco
      const transactionBody = response.body as TransactionResponse;
      const transaction = await prisma.transaction.findUnique({
        where: { id: transactionBody.id },
      });

      expect(transaction).not.toBeNull();
      expect(transaction?.senderUserId).toBe(senderUserId);
      expect(transaction?.receiverUserId).toBe(receiverUserId);
      expect(Number(transaction?.amount)).toBe(25.0);
    });

    it('deve atualizar saldos atomicamente', async () => {
      const validToken = generateJwtToken(senderUserId, 'sender@test.com');
      const initialSenderBalance = 1000.0;
      const initialReceiverBalance = 500.0;
      const transactionAmount = 100.0;

      // Resetar saldos
      const prismaWithBalance = prisma as unknown as {
        accountBalance: {
          update: (args: {
            where: { userId: string };
            data: { balance: number };
          }) => Promise<{ userId: string; balance: number | string }>;
        };
      };
      await prismaWithBalance.accountBalance.update({
        where: { userId: senderUserId },
        data: { balance: initialSenderBalance },
      });
      await prismaWithBalance.accountBalance.update({
        where: { userId: receiverUserId },
        data: { balance: initialReceiverBalance },
      });

      await getHttpServer()
        .post('/api/transactions')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          senderUserId,
          receiverUserId,
          amount: transactionAmount,
        })
        .expect(201);

      // Verificar saldos atualizados
      const prismaWithBalanceForRead = prisma as unknown as {
        accountBalance: {
          findUnique: (args: {
            where: { userId: string };
          }) => Promise<{ userId: string; balance: number | string } | null>;
        };
      };
      const senderBalance =
        await prismaWithBalanceForRead.accountBalance.findUnique({
          where: { userId: senderUserId },
        });
      const receiverBalance =
        await prismaWithBalanceForRead.accountBalance.findUnique({
          where: { userId: receiverUserId },
        });

      expect(Number(senderBalance?.balance)).toBe(
        initialSenderBalance - transactionAmount,
      );
      expect(Number(receiverBalance?.balance)).toBe(
        initialReceiverBalance + transactionAmount,
      );
    });
  });

  describe('Comunicação com microsserviço de Clientes', () => {
    it('deve validar usuários através do UserClientService', async () => {
      const validToken = generateJwtToken(senderUserId, 'sender@test.com');
      const validateSpy = jest.spyOn(userClientService, 'validateUserExists');

      await getHttpServer()
        .post('/api/transactions')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          senderUserId,
          receiverUserId,
          amount: 50.0,
        })
        .expect(201);

      expect(validateSpy).toHaveBeenCalledWith(
        senderUserId,
        expect.any(String),
      );
      expect(validateSpy).toHaveBeenCalledWith(
        receiverUserId,
        expect.any(String),
      );
    });

    it('deve retornar 404 quando usuário não existe no microsserviço de Clientes', async () => {
      const validToken = generateJwtToken(senderUserId, 'sender@test.com');
      jest
        .spyOn(userClientService, 'validateUserExists')
        .mockResolvedValueOnce(false);

      await getHttpServer()
        .post('/api/transactions')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          senderUserId: '550e8400-e29b-41d4-a716-446655440999',
          receiverUserId,
          amount: 50.0,
        })
        .expect(404);
    });
  });

  describe('Publicação de eventos no broker', () => {
    it('deve publicar evento quando transação é criada com sucesso', async () => {
      const validToken = generateJwtToken(senderUserId, 'sender@test.com');
      const publishSpy = jest.spyOn(
        eventPublisherService,
        'publishTransactionCompleted',
      );

      const response = await getHttpServer()
        .post('/api/transactions')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          senderUserId,
          receiverUserId,
          amount: 75.0,
          description: 'Event test',
        })
        .expect(201);

      const eventBody = response.body as TransactionResponse;
      expect(publishSpy).toHaveBeenCalledWith(
        eventBody.id,
        senderUserId,
        receiverUserId,
        75.0,
      );
    });

    it('deve continuar mesmo se publicação de evento falhar', async () => {
      const validToken = generateJwtToken(senderUserId, 'sender@test.com');
      jest
        .spyOn(eventPublisherService, 'publishTransactionCompleted')
        .mockRejectedValueOnce(new Error('Event publish failed'));

      const response = await getHttpServer()
        .post('/api/transactions')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          senderUserId,
          receiverUserId,
          amount: 50.0,
        })
        .expect(201);

      // Transação deve ser criada mesmo se evento falhar
      const body = response.body as TransactionResponse;
      expect(body).toHaveProperty('id');
      const transaction = await prisma.transaction.findUnique({
        where: { id: body.id },
      });
      expect(transaction).not.toBeNull();
    });
  });
});
