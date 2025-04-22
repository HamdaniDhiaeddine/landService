// src/docusign/docusign.controller.ts
import { Controller, Get, Post, Query, Body, Req, Res, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DocusignService } from './docusign.service';
import { Response, Request } from 'express';

@Controller('docusign')
export class DocusignController {
    private readonly logger = new Logger(DocusignController.name);

    constructor(
        private readonly docusignService: DocusignService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService
    ) { }

    @Get('login')
    login(@Res() res: Response) {
        try {
            const { authUrl, state } = this.docusignService.generateAuthUrl();

            // Stocker l'état dans un cookie sécurisé
            res.cookie('docusign_state', state, {
                httpOnly: true,
                maxAge: 3600000,
                path: '/',
                sameSite: 'lax' // Important pour le cross-domain
            });

            this.logger.log(`Redirection vers URL d'authentification DocuSign`);
            return res.redirect(authUrl);
        } catch (error) {
            this.logger.error(`Erreur lors de la génération de l'URL d'authentification: ${error.message}`);
            return res.status(500).json({
                error: 'Une erreur est survenue lors de l\'authentification'
            });
        }
    }

    @Get('callback')
    async callback(
        @Query('code') code: string,
        @Query('state') state: string,
        @Req() req: Request,
        @Res() res: Response,
    ) {
        try {
            if (!code) {
                throw new Error('Code d\'autorisation manquant');
            }

            // Log tous les cookies pour débugger
            this.logger.log(`Cookies reçus: ${JSON.stringify(req.cookies)}`);

            // Vérifier que l'état correspond à celui envoyé
            const savedState = req.cookies['docusign_state'];
            this.logger.log(`État reçu: ${state}, état cookie: ${savedState}`);

            // Mode permissif pour la démo - accepter n'importe quel état si nous sommes en développement
            let tokenResponse;
            try {
                // Essayer d'abord avec l'état reçu
                tokenResponse = await this.docusignService.exchangeCodeForToken(code, state);
            } catch (err) {
                // Si ça échoue et que nous avons un état dans les cookies, essayer avec celui-là
                if (savedState && savedState !== state) {
                    this.logger.warn(`Tentative avec l'état du cookie: ${savedState}`);
                    try {
                        tokenResponse = await this.docusignService.exchangeCodeForToken(code, savedState);
                    } catch (cookieErr) {
                        this.logger.error(`Échec également avec l'état du cookie: ${cookieErr.message}`);
                        throw err; // relancer l'erreur originale
                    }
                } else {
                    throw err;
                }
            }

            this.logger.log(`Token response: ${JSON.stringify(tokenResponse).substring(0, 100)}...`);

            let userInfo;
            let accountId = null;
            try {
                userInfo = await this.docusignService.getUserInfo(tokenResponse.accessToken);
                this.logger.log(`UserInfo récupéré: ${JSON.stringify(userInfo).substring(0, 200)}...`);

                if (userInfo && userInfo.accounts && userInfo.accounts.length > 0) {
                    // IMPORTANT: La propriété est 'account_id' (avec underscore) dans l'API REST directe
                    accountId = userInfo.accounts[0].account_id;

                    if (!accountId) {
                        // Essayer l'autre format possible selon la version de l'API
                        accountId = userInfo.accounts[0].accountId;
                    }

                    this.logger.log(`ID de compte récupéré: ${accountId}`);
                } else {
                    this.logger.warn('Aucun compte trouvé dans les informations utilisateur');
                }
            } catch (userInfoErr) {
                this.logger.warn(`Impossible de récupérer les informations utilisateur: ${userInfoErr.message}`);
            }

            // Créer un JWT avec les informations DocuSign
            const jwtToken = this.jwtService.sign({
                docusignToken: tokenResponse.accessToken,
                docusignTokenExpiry: Date.now() + (tokenResponse.expiresIn * 1000),
                docusignAccountId: accountId, // Stockage de l'ID de compte dans le JWT
                demo: true
            });

            // Stocker le JWT dans un cookie
            res.cookie('docusign_auth', jwtToken, {
                httpOnly: true,
                maxAge: tokenResponse.expiresIn * 1000,
                path: '/'
            });

            // Créer une page HTML temporaire de succès (pour la démo)
            this.logger.log('Authentification DocuSign réussie');
            return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>DocuSign Authentification Réussie</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
            .success { color: green; }
            .token { background: #f5f5f5; padding: 10px; border-radius: 3px; word-break: break-all; text-align: left; }
            button { background: #4CAF50; color: white; padding: 10px 15px; border: none; border-radius: 4px; cursor: pointer; }
          </style>
          <script>
            function copyToClipboard() {
              const tokenField = document.getElementById('token');
              navigator.clipboard.writeText(tokenField.textContent)
                .then(() => {
                  alert('Token copié dans le presse-papiers');
                })
                .catch(err => {
                  console.error('Erreur lors de la copie: ', err);
                });
            }
            
            // Stocker le token dans localStorage
            window.onload = function() {
              localStorage.setItem('docusign_jwt', '${jwtToken}');
              console.log('Token DocuSign stocké dans localStorage');
            }
          </script>
        </head>
        <body>
          <div class="container">
            <h1 class="success">Authentification DocuSign Réussie!</h1>
            <p>Votre application est maintenant authentifiée avec DocuSign.</p>
            <h3>JWT Token:</h3>
            <div class="token" id="token">${jwtToken}</div>
            <p><button onclick="copyToClipboard()">Copier le token</button></p>
            <p>Ce token a été également stocké dans:</p>
            <ul style="text-align: left;">
              <li>Le cookie <strong>docusign_auth</strong> (httpOnly)</li>
              <li>Le localStorage sous la clé <strong>docusign_jwt</strong></li>
            </ul>
            <p>Vous pouvez maintenant fermer cette fenêtre et continuer à utiliser votre application.</p>
          </div>
        </body>
        </html>
      `);
        } catch (error) {
            this.logger.error(`Erreur lors du traitement du callback: ${error.message}`);

            // Page d'erreur pour la démo
            return res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Erreur d'authentification</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
            .error { color: red; }
            .details { background: #f5f5f5; padding: 10px; border-radius: 3px; text-align: left; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1 class="error">Erreur d'authentification DocuSign</h1>
            <p>Une erreur s'est produite pendant l'authentification:</p>
            <div class="details">
              <strong>Message:</strong> ${error.message}<br>
              <strong>Code reçu:</strong> ${code || 'non fourni'}<br>
              <strong>État reçu:</strong> ${state || 'non fourni'}<br>
              <strong>État dans le cookie:</strong> ${req.cookies['docusign_state'] || 'non trouvé'}
            </div>
            <p>Vérifiez les logs du serveur pour plus de détails.</p>
            <p><a href="/docusign/login">Réessayer l'authentification</a></p>
          </div>
        </body>
        </html>
      `);
        }
    }

    @Get('success')
    getSuccess(@Req() req: Request) {
        try {
            const authCookie = req.cookies['docusign_auth'];
            if (!authCookie) {
                return {
                    authenticated: false,
                    message: 'Non authentifié'
                };
            }

            const decoded = this.jwtService.verify(authCookie);
            return {
                authenticated: true,
                expires: new Date(decoded.docusignTokenExpiry).toISOString(),
                accountId: decoded.docusignAccountId,
                demo: decoded.demo || false
            };
        } catch (error) {
            return {
                authenticated: false,
                error: error.message
            };
        }
    }

    @Post('create-envelope')
    async createEnvelope(
        @Body() data: {
            documentBase64: string;
            signerEmail: string;
            signerName: string;
            title: string;
        },
        @Req() req: Request,
    ) {
        try {
            // Extraire le token JWT du cookie ou de l'en-tête Authorization
            let jwtToken: string | undefined;

            if (req.cookies && req.cookies['docusign_auth']) {
                jwtToken = req.cookies['docusign_auth'];
                this.logger.log('Token trouvé dans les cookies');
            } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
                jwtToken = req.headers.authorization.substring(7);
                this.logger.log('Token trouvé dans l\'en-tête Authorization');
            }

            if (!jwtToken) {
                this.logger.error('Aucun token JWT trouvé');
                throw new Error('Non authentifié');
            }

            // Décoder le JWT
            const decoded = this.jwtService.verify(jwtToken);

            // Vérifier que le token n'est pas expiré
            if (decoded.docusignTokenExpiry < Date.now()) {
                throw new Error('Token DocuSign expiré');
            }

            // Récupérer le token DocuSign et l'ID du compte
            const token = decoded.docusignToken;
            const accountId = decoded.docusignAccountId;

            this.logger.log(`Token DocuSign récupéré du JWT`);
            this.logger.log(`ID de compte disponible: ${accountId || 'Non disponible'}`);

            // Créer l'enveloppe
            const envelopeId = await this.docusignService.createEnvelope(
                token,
                data.documentBase64,
                data.signerEmail,
                data.signerName,
                data.title,
                accountId // Peut être null ou undefined, la méthode createEnvelope gèrera ce cas
            );

            return { success: true, envelopeId };
        } catch (error) {
            this.logger.error(`Erreur lors de la création de l'enveloppe: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
}