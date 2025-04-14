import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Configuration CORS pour permettre les requêtes cross-origin
  app.enableCors({
    origin: true, // Autorise toutes les origines ou spécifiez les origines autorisées: ['http://localhost:3000']
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
  });
  
  app.useGlobalPipes(new ValidationPipe());
  
  // Afficher un message pour savoir sur quel port le serveur démarre
  const port = process.env.PORT ?? 5000;
  await app.listen(port);
  console.log(`[${new Date().toISOString()}] LandService démarré sur le port ${port} - Accessible à http://localhost:${port}`);
}

bootstrap().catch(err => {
  console.error(`[${new Date().toISOString()}] Erreur de démarrage du serveur:`, err);
});