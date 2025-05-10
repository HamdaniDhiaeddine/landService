import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { CacheModule } from '@nestjs/cache-manager'; 
import { ScheduleModule } from '@nestjs/schedule'; 
import { AuthModule } from './auth/auth.module';
import { LocationModule } from './location/location.module';
import { EncryptionModule } from './encryption/encryption.module';
import { IpfsModule } from './ipfs/ipfs.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { LandModule } from './lands/lands.module';
import { DocusignModule } from './docusign/docusign.module';
import { MarketplaceModule } from './marketplace/marketplace.module';

@Module({
  imports: [
    // Configuration globale des variables d'environnement
    ConfigModule.forRoot({
      isGlobal: true, 
      envFilePath: '.env'
    }),
    
    // Configuration du cache global
    CacheModule.register({
      isGlobal: true,  
      ttl: 300,        
      max: 1000,        
    }),
    
    // Module pour les tâches planifiées
    ScheduleModule.forRoot(),
    
    // Configuration de la connexion MongoDB
    MongooseModule.forRoot(process.env.MONGO_URL),
    
    // Modules de l'application
    LandModule,
    AuthModule,
    LocationModule,
    EncryptionModule,
    IpfsModule,
    BlockchainModule, 
    DocusignModule, 
    MarketplaceModule,
  ],

})
export class AppModule {}