import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Augmenter la limite de taille pour les requêtes
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
   // Middleware pour les cookies
  app.use(cookieParser());
  
  // Configuration CORS pour permettre les requêtes cross-origin
  app.enableCors({
    origin: true, 
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    //allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization', 'X-DocuSign-Token'],
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