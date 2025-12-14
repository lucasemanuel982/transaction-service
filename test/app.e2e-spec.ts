import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Application } from 'supertest';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<Application>;

  beforeEach(async () => {
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

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });
});
