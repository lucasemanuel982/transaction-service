import { Test, TestingModule } from '@nestjs/testing';
import { UserClientService } from './user-client.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import axios, { AxiosError, AxiosResponse } from 'axios';

// Mock do axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('UserClientService', () => {
  let service: UserClientService;
  let mockAxiosInstance: {
    get: jest.Mock;
  };

  beforeEach(() => {
    mockAxiosInstance = {
      get: jest.fn(),
    };

    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);
    // Mock do isAxiosError para retornar true quando o erro for um AxiosError
    mockedAxios.isAxiosError = jest.fn((error: unknown): error is AxiosError => {
      return (
        typeof error === 'object' &&
        error !== null &&
        'isAxiosError' in error &&
        (error as AxiosError).isAxiosError === true
      );
    });

    service = new UserClientService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateUserExists', () => {
    const userId = 'user-123';
    const authToken = 'bearer-token';

    it('deve retornar true quando usuário existe', async () => {
      const mockResponse: AxiosResponse = {
        data: {
          id: userId,
          name: 'Test User',
          email: 'test@example.com',
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await service.validateUserExists(userId, authToken);

      expect(result).toBe(true);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `/api/users/${userId}`,
        expect.objectContaining({
          headers: { Authorization: `Bearer ${authToken}` },
        }),
      );
    });

    it('deve retornar false quando usuário não existe (404)', async () => {
      const mockResponse: AxiosResponse = {
        data: null,
        status: 404,
        statusText: 'Not Found',
        headers: {},
        config: {} as any,
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await service.validateUserExists(userId, authToken);

      expect(result).toBe(false);
    });

    it('deve retornar false quando resposta é null', async () => {
      const mockResponse: AxiosResponse = {
        data: null,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await service.validateUserExists(userId, authToken);

      expect(result).toBe(false);
    });

    it('deve lançar HttpException para erro 401', async () => {
      const axiosError: AxiosError = {
        isAxiosError: true,
        message: 'Unauthorized',
        response: {
          data: { error: 'Unauthorized' },
          status: 401,
          statusText: 'Unauthorized',
          headers: {},
          config: {} as any,
        },
        config: {} as any,
        name: 'AxiosError',
        toJSON: () => ({}),
      };

      mockAxiosInstance.get.mockRejectedValue(axiosError);

      await expect(
        service.validateUserExists(userId, authToken),
      ).rejects.toThrow(HttpException);

      await expect(
        service.validateUserExists(userId, authToken),
      ).rejects.toThrow('Erro de autenticação ao validar usuário');
    });

    it('deve lançar HttpException para erro 403', async () => {
      const axiosError: AxiosError = {
        isAxiosError: true,
        message: 'Forbidden',
        response: {
          data: { error: 'Forbidden' },
          status: 403,
          statusText: 'Forbidden',
          headers: {},
          config: {} as any,
        },
        config: {} as any,
        name: 'AxiosError',
        toJSON: () => ({}),
      };

      mockAxiosInstance.get.mockRejectedValue(axiosError);

      await expect(
        service.validateUserExists(userId, authToken),
      ).rejects.toThrow(HttpException);
    });

    it('deve retornar false para erro 404 via AxiosError', async () => {
      // Quando validateStatus permite 404, o axios retorna a resposta normalmente
      // Mas se houver uma exceção (erro de rede), o catch trata o 404
      const axiosError: AxiosError = {
        isAxiosError: true,
        message: 'Not Found',
        response: {
          data: { error: 'Not Found' },
          status: 404,
          statusText: 'Not Found',
          headers: {},
          config: {} as any,
        },
        config: {} as any,
        name: 'AxiosError',
        toJSON: () => ({}),
      };

      mockAxiosInstance.get.mockRejectedValue(axiosError);

      const result = await service.validateUserExists(userId, authToken);

      expect(result).toBe(false);
      // Não deve lançar exceção para 404, deve retornar false
      expect(mockAxiosInstance.get).toHaveBeenCalled();
    });

    it('deve lançar HttpException para erro de comunicação', async () => {
      const axiosError: AxiosError = {
        isAxiosError: true,
        message: 'Network Error',
        config: {} as any,
        name: 'AxiosError',
        toJSON: () => ({}),
      };

      mockAxiosInstance.get.mockRejectedValue(axiosError);

      await expect(
        service.validateUserExists(userId, authToken),
      ).rejects.toThrow(HttpException);

      await expect(
        service.validateUserExists(userId, authToken),
      ).rejects.toThrow('Erro ao comunicar com o microsserviço de Clientes');
    });

    it('deve funcionar sem authToken', async () => {
      const mockResponse: AxiosResponse = {
        data: {
          id: userId,
          name: 'Test User',
          email: 'test@example.com',
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await service.validateUserExists(userId);

      expect(result).toBe(true);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `/api/users/${userId}`,
        expect.objectContaining({
          headers: {},
        }),
      );
    });
  });

  describe('getUser', () => {
    const userId = 'user-123';
    const authToken = 'bearer-token';

    it('deve retornar dados do usuário quando encontrado', async () => {
      const userData = {
        id: userId,
        name: 'Test User',
        email: 'test@example.com',
        bankingDetails: {
          accountNumber: '12345-6',
          bankCode: '001',
        },
      };

      const mockResponse: AxiosResponse = {
        data: userData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await service.getUser(userId, authToken);

      expect(result).toEqual(userData);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `/api/users/${userId}`,
        expect.objectContaining({
          headers: { Authorization: `Bearer ${authToken}` },
        }),
      );
    });

    it('deve lançar HttpException quando usuário não encontrado (404)', async () => {
      const axiosError: AxiosError = {
        isAxiosError: true,
        message: 'Not Found',
        response: {
          data: { error: 'Not Found' },
          status: 404,
          statusText: 'Not Found',
          headers: {},
          config: {} as any,
        },
        config: {} as any,
        name: 'AxiosError',
        toJSON: () => ({}),
      };

      mockAxiosInstance.get.mockRejectedValue(axiosError);

      await expect(service.getUser(userId, authToken)).rejects.toThrow(
        HttpException,
      );

      await expect(service.getUser(userId, authToken)).rejects.toThrow(
        `Usuário ${userId} não encontrado`,
      );
      
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
    });

    it('deve lançar HttpException para erro 401', async () => {
      const axiosError: AxiosError = {
        isAxiosError: true,
        message: 'Unauthorized',
        response: {
          data: { error: 'Unauthorized' },
          status: 401,
          statusText: 'Unauthorized',
          headers: {},
          config: {} as any,
        },
        config: {} as any,
        name: 'AxiosError',
        toJSON: () => ({}),
      };

      mockAxiosInstance.get.mockRejectedValue(axiosError);

      await expect(service.getUser(userId, authToken)).rejects.toThrow(
        HttpException,
      );
    });

    it('deve lançar HttpException para erro 403', async () => {
      const axiosError: AxiosError = {
        isAxiosError: true,
        message: 'Forbidden',
        response: {
          data: { error: 'Forbidden' },
          status: 403,
          statusText: 'Forbidden',
          headers: {},
          config: {} as any,
        },
        config: {} as any,
        name: 'AxiosError',
        toJSON: () => ({}),
      };

      mockAxiosInstance.get.mockRejectedValue(axiosError);

      await expect(service.getUser(userId, authToken)).rejects.toThrow(
        HttpException,
      );
    });

    it('deve lançar HttpException para erro de comunicação', async () => {
      const axiosError: AxiosError = {
        isAxiosError: true,
        message: 'Network Error',
        config: {} as any,
        name: 'AxiosError',
        toJSON: () => ({}),
      };

      mockAxiosInstance.get.mockRejectedValue(axiosError);

      await expect(service.getUser(userId, authToken)).rejects.toThrow(
        HttpException,
      );
    });

    it('deve lançar HttpException quando resposta não contém dados', async () => {
      const mockResponse: AxiosResponse = {
        data: null,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      await expect(service.getUser(userId, authToken)).rejects.toThrow(
        HttpException,
      );
    });

    it('deve funcionar sem authToken', async () => {
      const userData = {
        id: userId,
        name: 'Test User',
        email: 'test@example.com',
      };

      const mockResponse: AxiosResponse = {
        data: userData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await service.getUser(userId);

      expect(result).toEqual(userData);
    });
  });
});
