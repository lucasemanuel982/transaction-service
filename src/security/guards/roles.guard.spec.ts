import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

interface MockUser {
  userId: string;
  email?: string;
  role?: string;
  jti?: string;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  const mockExecutionContext = (user: MockUser | null) => {
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: user ?? undefined,
        }),
      }),
    } as unknown as ExecutionContext;

    return context;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  it('deve ser definido', () => {
    expect(guard).toBeDefined();
  });

  it('deve permitir acesso quando não há roles requeridas', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const context = mockExecutionContext({ userId: '123', role: 'user' });
    const result = guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('deve permitir acesso quando o usuário tem a role requerida', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);

    const context = mockExecutionContext({
      userId: '123',
      email: 'admin@test.com',
      role: 'admin',
    });
    const result = guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('deve permitir acesso quando o usuário tem uma das roles requeridas', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['admin', 'manager']);

    const context = mockExecutionContext({
      userId: '123',
      email: 'manager@test.com',
      role: 'manager',
    });
    const result = guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('deve negar acesso quando o usuário não tem a role requerida', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);

    const context = mockExecutionContext({
      userId: '123',
      email: 'user@test.com',
      role: 'user',
    });

    expect(() => {
      void guard.canActivate(context);
    }).toThrow(ForbiddenException);
  });

  it('deve negar acesso quando o usuário não está autenticado', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);

    const context = mockExecutionContext(null);

    expect(() => {
      void guard.canActivate(context);
    }).toThrow(ForbiddenException);
  });

  it('deve negar acesso quando o usuário não tem role definida', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);

    const context = mockExecutionContext({
      userId: '123',
      email: 'user@test.com',
    });

    expect(() => {
      void guard.canActivate(context);
    }).toThrow(ForbiddenException);
  });

  it('deve incluir informações sobre roles requeridas e do usuário na mensagem de erro', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['admin', 'manager']);

    const context = mockExecutionContext({
      userId: '123',
      email: 'user@test.com',
      role: 'user',
    });

    try {
      void guard.canActivate(context);
      fail('Deveria ter lançado ForbiddenException');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      if (error instanceof ForbiddenException) {
        expect(error.message).toContain('admin, manager');
        expect(error.message).toContain('user');
      }
    }
  });
});
