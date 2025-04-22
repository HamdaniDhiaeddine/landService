// src/docusign/docusign.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as docusign from 'docusign-esign';
import * as crypto from 'crypto';
import axios from 'axios';

@Injectable()
export class DocusignService {
    private readonly logger = new Logger(DocusignService.name);
    private apiClient: docusign.ApiClient;
    private readonly codeVerifiers: Record<string, { value: string, timestamp: number }> = {};

    constructor(private configService: ConfigService) {
        this.apiClient = new docusign.ApiClient({
            basePath: this.configService.get<string>('DOCUSIGN_API_BASE_PATH'),
            oAuthBasePath: this.configService.get<string>('DOCUSIGN_AUTH_SERVER'),
        });

        this.logger.log(`DocuSign API configuré pour l'environnement de démonstration`);
        this.logger.log(`Base Path: ${this.configService.get<string>('DOCUSIGN_API_BASE_PATH')}`);
        this.logger.log(`OAuth Path: ${this.configService.get<string>('DOCUSIGN_AUTH_SERVER')}`);
    }


    /**
     * Génère une URL d'authentification OAuth avec PKCE
     */
    generateAuthUrl(): {
        authUrl: string;
        state: string;
    } {
        const integrationKey = this.configService.get<string>('DOCUSIGN_INTEGRATION_KEY');
        const redirectUri = this.configService.get<string>('DOCUSIGN_REDIRECT_URI');
        const state = crypto.randomBytes(16).toString('hex');

        // Générer le code_verifier et le code_challenge
        const codeVerifier = this.generateCodeVerifier();
        const codeChallenge = this.generateCodeChallenge(codeVerifier);

        // Stocker le code_verifier pour une utilisation ultérieure
        this.codeVerifiers[state] = {
            value: codeVerifier,
            timestamp: Date.now()
        };

        const authUrl = `${this.configService.get<string>('DOCUSIGN_AUTH_SERVER')}/oauth/auth?` +
            `response_type=code&` +
            `scope=signature%20extended&` +
            `client_id=${integrationKey}&` +
            `redirect_uri=${encodeURIComponent(redirectUri)}&` +
            `state=${state}&` +
            `code_challenge=${codeChallenge}&` +
            `code_challenge_method=S256`;

        this.logger.log(`URL d'autorisation générée: ${authUrl}`);
        this.logger.log(`État généré: ${state}`);
        this.logger.log(`Code verifier généré et stocké pour l'état: ${state}`);

        return {
            authUrl,
            state,
        };
    }

    /**
     * Échange le code d'autorisation contre un token d'accès
     */
    async exchangeCodeForToken(code: string, state: string): Promise<any> {
        try {
            this.logger.log(`Échange de code pour l'état: ${state}`);
            this.logger.log(`États disponibles: ${Object.keys(this.codeVerifiers).join(', ')}`);

            const verifierObj = this.codeVerifiers[state];

            if (!verifierObj) {
                this.logger.error(`Code verifier non trouvé pour l'état: ${state}`);
                throw new Error('Code verifier not found for state');
            }

            const codeVerifier = verifierObj.value;

            this.logger.log(`Échange du code pour token avec code_verifier: ${codeVerifier.substring(0, 10)}...`);

            const integrationKey = this.configService.get<string>('DOCUSIGN_INTEGRATION_KEY');
            const clientSecret = this.configService.get<string>('DOCUSIGN_CLIENT_SECRET');
            const redirectUri = this.configService.get<string>('DOCUSIGN_REDIRECT_URI');
            const authServer = this.configService.get<string>('DOCUSIGN_AUTH_SERVER');

            // Préparation des paramètres de la requête
            const params = new URLSearchParams();
            params.append('grant_type', 'authorization_code');
            params.append('code', code);
            params.append('client_id', integrationKey);
            params.append('client_secret', clientSecret);
            params.append('redirect_uri', redirectUri);
            params.append('code_verifier', codeVerifier);

            this.logger.log(`Envoi de la requête token à ${authServer}/oauth/token`);

            // Appel direct à l'API OAuth2 de DocuSign
            const response = await axios.post(
                `${authServer}/oauth/token`,
                params.toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            this.logger.log('Token d\'accès généré avec succès');

            // Nettoyer après utilisation
            delete this.codeVerifiers[state];

            // Transformer la réponse pour qu'elle soit conforme à ce qu'attend le reste du code
            return {
                accessToken: response.data.access_token,
                tokenType: response.data.token_type,
                expiresIn: response.data.expires_in,
                refreshToken: response.data.refresh_token,
                scope: response.data.scope
            };
        } catch (error) {
            if (error.response) {
                // L'erreur est une réponse du serveur
                this.logger.error(`Erreur serveur DocuSign: ${error.response.status}`);
                this.logger.error(`Données d'erreur: ${JSON.stringify(error.response.data)}`);
            } else if (error.request) {
                // La requête a été faite mais pas de réponse
                this.logger.error(`Pas de réponse du serveur DocuSign: ${error.request}`);
            } else {
                // Une erreur s'est produite lors de la configuration de la requête
                this.logger.error(`Erreur lors de la configuration de la requête: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * Utilitaire pour échanger un code contre un token avec un code verifier donné
     */
    private exchangeTokenWithVerifier(code: string, codeVerifier: string): Promise<any> {
        const integrationKey = this.configService.get<string>('DOCUSIGN_INTEGRATION_KEY');
        const clientSecret = this.configService.get<string>('DOCUSIGN_CLIENT_SECRET');
        const redirectUri = this.configService.get<string>('DOCUSIGN_REDIRECT_URI');

        // Promisify le callback
        return new Promise((resolve, reject) => {
            this.apiClient.generateAccessToken(
                integrationKey,
                clientSecret,
                code,
                {
                    redirectUri,
                    codeVerifier,
                },
                (error, response) => {
                    if (error) {
                        this.logger.error(`Erreur token DocuSign: ${JSON.stringify(error)}`);
                        return reject(error);
                    }
                    this.logger.log('Token d\'accès généré avec succès');
                    resolve(response);
                }
            );
        });
    }



/**
 * Crée une enveloppe pour la signature
 */
async createEnvelope(
    accessToken: string, 
    documentBase64: string, 
    signerEmail: string, 
    signerName: string, 
    title: string,
    accountId?: string
  ): Promise<string> {
    try {
      // Configurer l'authentification
      this.apiClient.addDefaultHeader('Authorization', `Bearer ${accessToken}`);
      
      // Si l'ID du compte n'est pas fourni, le récupérer depuis les infos utilisateur
      let accountIdToUse = accountId;
      
      if (!accountIdToUse) {
        this.logger.log('ID de compte non fourni, tentative de récupération depuis l\'API userInfo');
        
        // Obtenir l'ID de compte de l'utilisateur
        const userInfo = await this.getUserInfo(accessToken);
        
        // Log pour débogage
        this.logger.log(`UserInfo reçu: ${JSON.stringify(userInfo).substring(0, 200)}...`);
        
        if (!userInfo.accounts || userInfo.accounts.length === 0) {
          throw new Error("Aucun compte DocuSign disponible pour cet utilisateur");
        }
        
        // Utiliser le premier compte disponible
        // IMPORTANT: La propriété est 'account_id' (avec underscore) dans l'API REST directe
        accountIdToUse = userInfo.accounts[0].account_id;
        
        if (!accountIdToUse) {
          // Essayer l'autre format possible selon la version de l'API
          accountIdToUse = userInfo.accounts[0].accountId;
        }
        
        if (!accountIdToUse) {
          throw new Error("Impossible de déterminer l'ID de compte DocuSign");
        }
        
        this.logger.log(`ID de compte récupéré: ${accountIdToUse}`);
      }
      
      // Initialiser les API
      const envelopesApi = new docusign.EnvelopesApi(this.apiClient);
      
      // Créer la définition de l'enveloppe
      const envDef = new docusign.EnvelopeDefinition();
      envDef.emailSubject = `Validation juridique du terrain: ${title}`;
      
      // Ajouter le document
      const doc = new docusign.Document();
      doc.documentBase64 = documentBase64;
      doc.name = `Validation Juridique - ${title}`;
      doc.fileExtension = 'pdf';
      doc.documentId = '1';
      envDef.documents = [doc];
      
      // Ajouter le signataire
      const signer = new docusign.Signer();
      signer.email = signerEmail;
      signer.name = signerName;
      signer.recipientId = '1';
      signer.routingOrder = '1';
      
      // Ajouter des onglets (où signer, date, etc.)
      const signHere = new docusign.SignHere();
      signHere.documentId = '1';
      signHere.pageNumber = '1';
      signHere.xPosition = '200';
      signHere.yPosition = '400';
      
      const dateSignedTab = new docusign.DateSigned();
      dateSignedTab.documentId = '1';
      dateSignedTab.pageNumber = '1';
      dateSignedTab.xPosition = '200';
      dateSignedTab.yPosition = '450';
      
      // Appliquer les onglets au signataire
      const tabs = new docusign.Tabs();
      tabs.signHereTabs = [signHere];
      tabs.dateSignedTabs = [dateSignedTab];
      signer.tabs = tabs;
      
      // Ajouter le signataire à l'enveloppe
      const recipients = new docusign.Recipients();
      recipients.signers = [signer];
      envDef.recipients = recipients;
      
      // Définir le statut de l'enveloppe
      envDef.status = 'sent';
      
      this.logger.log(`Création d'une enveloppe avec l'ID de compte: ${accountIdToUse}`);
      
      // Créer l'enveloppe - UTILISER L'ID DE COMPTE
      const envelopeResponse = await envelopesApi.createEnvelope(accountIdToUse, { envelopeDefinition: envDef });
      
      this.logger.log(`Enveloppe créée avec l'ID: ${envelopeResponse.envelopeId}`);
      return envelopeResponse.envelopeId;
    } catch (error) {
      this.logger.error(`Erreur lors de la création de l'enveloppe: ${error.message}`);
      if (error.response && error.response.data) {
        this.logger.error(`Détails de l'erreur: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

    /**
     * Récupère les informations de l'utilisateur, y compris les comptes disponibles
     */
    async getUserInfo(accessToken: string): Promise<any> {
        try {
            const authServer = this.configService.get<string>('DOCUSIGN_AUTH_SERVER');

            const response = await axios.get(
                `${authServer}/oauth/userinfo`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                }
            );

            this.logger.log('Informations utilisateur récupérées avec succès');
            return response.data;
        } catch (error) {
            if (error.response) {
                this.logger.error(`Erreur serveur lors de la récupération des infos utilisateur: ${error.response.status}`);
            } else {
                this.logger.error(`Erreur lors de la récupération des informations utilisateur: ${error.message}`);
            }
            throw error;
        }
    }

    // Méthodes utilitaires pour PKCE
    private generateCodeVerifier(): string {
        return crypto.randomBytes(32)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    private generateCodeChallenge(codeVerifier: string): string {
        const hash = crypto.createHash('sha256')
            .update(codeVerifier)
            .digest();

        return Buffer.from(hash)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }
}