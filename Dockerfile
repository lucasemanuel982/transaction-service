# Dockerfile para Transaction Service
FROM node:20-alpine AS builder

# Definir diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./

# Instalar dependências
RUN npm ci

# Copiar código fonte
COPY . .

# Gerar Prisma Client
RUN npx prisma generate

# Build da aplicação
RUN npm run build

# Stage de produção
FROM node:20-alpine AS production

# Instalar OpenSSL necessário para o Prisma Client
RUN apk add --no-cache openssl

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar apenas dependências de produção
RUN npm ci --only=production && npm cache clean --force

# Copiar código compilado do builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/schemas ./src/schemas

# Instalar Prisma CLI temporariamente para gerar o client
RUN npm install prisma --no-save

# Gerar Prisma Client
RUN npx prisma generate

# Criar usuário não-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Mudar propriedade dos arquivos
RUN chown -R nestjs:nodejs /app

USER nestjs

# Expor porta
EXPOSE 3002

# Comando de inicialização
CMD ["node", "dist/main.js"]

