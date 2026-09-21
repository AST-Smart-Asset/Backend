import { createApp } from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './database/prisma';

async function bootstrap() {
  const app = createApp();

  // Connect Database
  await connectDatabase();

  const server = app.listen(env.PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 AST Smart Asset Backend API Service Online`);
    console.log(`📡 URL: http://localhost:${env.PORT}`);
    console.log(`📘 OpenAPI Docs: http://localhost:${env.PORT}/docs`);
    console.log(`🏥 Health Check: http://localhost:${env.PORT}/health`);
    console.log(`🌐 API Endpoint Prefix: ${env.API_PREFIX}`);
    console.log(`=======================================================`);
  });

  // Graceful shutdown handling
  const handleShutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal}. Gracefully shutting down...`);
    server.close(async () => {
      await disconnectDatabase();
      console.log('✅ Server and database connections closed cleanly.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});
