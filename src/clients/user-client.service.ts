import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import axios, { AxiosError, AxiosResponse } from 'axios';
import type { AxiosInstance } from 'axios';

// Tipos de dados do usuário
interface UserData {
  id: string;
  name: string;
  email: string;
  bankingDetails?: {
    accountNumber?: string;
    bankCode?: string;
  };
}

type GetUserResponse = AxiosResponse<UserData | null>;

@Injectable()
export class UserClientService {
  private readonly logger = new Logger(UserClientService.name);
  private readonly userServiceUrl: string;
  private readonly httpClient: AxiosInstance;

  constructor() {
    const envUrl: string | undefined = process.env.USER_SERVICE_URL;
    this.userServiceUrl =
      typeof envUrl === 'string' && envUrl.trim() !== ''
        ? envUrl
        : 'http://localhost:3001';
    this.httpClient = axios.create({
      baseURL: this.userServiceUrl,
      timeout: 5000,
      maxRedirects: 5,
    });
  }

  /**
   * Valida se um usuário existe no microsserviço de Clientes
   * @param userId ID do usuário a ser validado
   * @param authToken Token JWT para autenticação
   * @returns true se o usuário existe, false caso contrário
   */
  async validateUserExists(
    userId: string,
    authToken?: string,
  ): Promise<boolean> {
    try {
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const response: GetUserResponse =
        await this.httpClient.get<UserData | null>(`/api/users/${userId}`, {
          headers,
          validateStatus: (status) => status === 200 || status === 404,
        });

      if (response.status === 200) {
        const userData = response.data;
        if (userData !== null) {
          return true;
        }
        return false;
      } else if (response.status === 404) {
        this.logger.warn(`Usuário ${userId} não encontrado no User Service`);
        return false;
      }

      return false;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<{ message?: string }>;
        const status = axiosError.response?.status;

        if (status === 404) {
          this.logger.warn(`Usuário ${userId} não encontrado no User Service`);
          return false;
        }
        if (status === 401 || status === 403) {
          const statusText = axiosError.response?.statusText ?? 'Unknown';
          this.logger.warn(
            `Erro de autenticação ao validar usuário ${userId}: ${statusText}`,
          );
          throw new HttpException(
            'Erro de autenticação ao validar usuário',
            HttpStatus.UNAUTHORIZED,
          );
        }
      }

      this.logger.error(
        `Erro ao validar usuário ${userId} no User Service:`,
        error,
      );
      throw new HttpException(
        'Erro ao comunicar com o microsserviço de Clientes',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Busca informações de um usuário no microsserviço de Clientes
   * @param userId ID do usuário
   * @param authToken Token JWT para autenticação
   * @returns Dados do usuário
   */
  async getUser(userId: string, authToken?: string): Promise<UserData> {
    try {
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const response: AxiosResponse<UserData> =
        await this.httpClient.get<UserData>(`/api/users/${userId}`, {
          headers,
        });

      if (response.status === 200 && response.data) {
        return response.data;
      }

      throw new HttpException(
        `Usuário ${userId} não encontrado`,
        HttpStatus.NOT_FOUND,
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<{ message?: string }>;
        const status = axiosError.response?.status;

        if (status === 404) {
          throw new HttpException(
            `Usuário ${userId} não encontrado`,
            HttpStatus.NOT_FOUND,
          );
        }
        if (status === 401 || status === 403) {
          throw new HttpException(
            'Erro de autenticação ao buscar usuário',
            HttpStatus.UNAUTHORIZED,
          );
        }
      }

      this.logger.error(
        `Erro ao buscar usuário ${userId} no User Service:`,
        error,
      );
      throw new HttpException(
        'Erro ao comunicar com o microsserviço de Clientes',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
