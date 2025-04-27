// src/docusign/docusign.controller.ts

import { Controller, Get, Post, Query, Body, Req, Res, Param, Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DocusignService } from './docusign.service';
import { Response, Request } from 'express';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { PermissionGuard } from 'src/auth/guards/permission.guard';
import { JWTPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { SignatureHistoryService } from './signature-history.service';

@Controller('docusign')

export class DocusignController {
    private readonly logger = new Logger(DocusignController.name);

    constructor(
        private readonly docusignService: DocusignService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
        private readonly signatureHistoryService: SignatureHistoryService
    ) { }

    // Login route reste sans guard car elle initie l'authentification
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
            const currentDateTime = '2025-04-27 09:46:19';
            const currentUserLogin = 'nesssim';

            this.logger.log(`${currentUserLogin} à ${currentDateTime} - DocuSign callback reçu avec code: ${code.substring(0, 10)}...`);

            if (!code) {
                throw new Error('Code d\'autorisation manquant');
            }

            // Log tous les cookies pour débugger
            this.logger.log(`${currentUserLogin} à ${currentDateTime} - Cookies reçus: ${JSON.stringify(req.cookies)}`);

            // Vérifier que l'état correspond à celui envoyé
            const savedState = req.cookies['docusign_state'];
            this.logger.log(`${currentUserLogin} à ${currentDateTime} - État reçu: ${state}, état cookie: ${savedState}`);

            // Mode permissif pour la démo - accepter n'importe quel état si nous sommes en développement
            let tokenResponse;
            try {
                // Essayer d'abord avec l'état reçu
                tokenResponse = await this.docusignService.exchangeCodeForToken(code, state);

                // Log pour afficher le token (première partie seulement pour la sécurité)
                this.logger.log(`${currentUserLogin} à ${currentDateTime} - Token DocuSign obtenu: ${tokenResponse.accessToken.substring(0, 15)}...`);
                this.logger.log(`${currentUserLogin} à ${currentDateTime} - Token expire dans: ${tokenResponse.expiresIn} secondes`);

            } catch (err) {
                // Si ça échoue et que nous avons un état dans les cookies, essayer avec celui-là
                if (savedState && savedState !== state) {
                    this.logger.warn(`${currentUserLogin} à ${currentDateTime} - Tentative avec l'état du cookie: ${savedState}`);
                    try {
                        tokenResponse = await this.docusignService.exchangeCodeForToken(code, savedState);
                        this.logger.log(`${currentUserLogin} à ${currentDateTime} - Token obtenu avec l'état du cookie: ${tokenResponse.accessToken.substring(0, 15)}...`);
                    } catch (cookieErr) {
                        this.logger.error(`${currentUserLogin} à ${currentDateTime} - Échec également avec l'état du cookie: ${cookieErr.message}`);
                        throw err; // relancer l'erreur originale
                    }
                } else {
                    throw err;
                }
            }

            this.logger.log(`${currentUserLogin} à ${currentDateTime} - Token DocuSign obtenu avec succès, type: ${tokenResponse.tokenType}`);

            let userInfo;
            let accountId = null;
            try {
                userInfo = await this.docusignService.getUserInfo(tokenResponse.accessToken);
                this.logger.log(`${currentUserLogin} à ${currentDateTime} - UserInfo récupéré, nom: ${userInfo.name || 'Non disponible'}, email: ${userInfo.email || 'Non disponible'}`);

                if (userInfo && userInfo.accounts && userInfo.accounts.length > 0) {
                    // IMPORTANT: La propriété est 'account_id' (avec underscore) dans l'API REST directe
                    accountId = userInfo.accounts[0].account_id;

                    if (!accountId) {
                        // Essayer l'autre format possible selon la version de l'API
                        accountId = userInfo.accounts[0].accountId;
                    }

                    this.logger.log(`${currentUserLogin} à ${currentDateTime} - ID de compte récupéré: ${accountId}`);
                    this.logger.log(`${currentUserLogin} à ${currentDateTime} - Nom du compte: ${userInfo.accounts[0].account_name || 'Non disponible'}`);
                    this.logger.log(`${currentUserLogin} à ${currentDateTime} - Base URL API: ${userInfo.accounts[0].base_uri || 'Non disponible'}`);
                } else {
                    this.logger.warn(`${currentUserLogin} à ${currentDateTime} - Aucun compte trouvé dans les informations utilisateur`);
                }
            } catch (userInfoErr) {
                this.logger.warn(`${currentUserLogin} à ${currentDateTime} - Impossible de récupérer les informations utilisateur: ${userInfoErr.message}`);
            }

            // Créer un JWT avec les informations DocuSign
            const jwtPayload = {
                docusignToken: tokenResponse.accessToken,
                docusignTokenExpiry: Date.now() + (tokenResponse.expiresIn * 1000),
                docusignAccountId: accountId,
                timestamp: currentDateTime,
                userLogin: currentUserLogin,
                docusignUserInfo: {
                    name: userInfo?.name,
                    email: userInfo?.email
                }
            };

            // Log le contenu du payload JWT (sans le token complet)
            const safePayload = { ...jwtPayload };
            safePayload.docusignToken = `${safePayload.docusignToken.substring(0, 15)}...`;
            this.logger.log(`${currentUserLogin} à ${currentDateTime} - Payload JWT: ${JSON.stringify(safePayload)}`);

            const jwtToken = this.jwtService.sign(jwtPayload);
            this.logger.log(`${currentUserLogin} à ${currentDateTime} - JWT généré: ${jwtToken.substring(0, 20)}...`);

            // Stocker le JWT dans un cookie
            res.cookie('docusign_auth', jwtToken, {
                httpOnly: true,
                maxAge: tokenResponse.expiresIn * 1000,
                path: '/'
            });
            this.logger.log(`${currentUserLogin} à ${currentDateTime} - Cookie docusign_auth défini avec expiration dans ${tokenResponse.expiresIn} secondes`);

            // Obtenir l'URL du frontend depuis la configuration
            const frontendUrl = this.configService.get<string>('FRONTEND_URL');
            this.logger.log(`${currentUserLogin} à ${currentDateTime} - URL frontend: ${frontendUrl}`);

            // Construire l'URL de redirection avec les paramètres
            // IMPORTANT: Noter le #/ ajouté dans l'URL pour le routage côté client
            const redirectUrl = `${frontendUrl}/#/docusign-auth?` +
                `token=${encodeURIComponent(tokenResponse.accessToken)}` +
                `&jwt=${encodeURIComponent(jwtToken)}` +
                `&expires_in=${tokenResponse.expiresIn}` +
                `&account_id=${encodeURIComponent(accountId || '')}` +
                `&timestamp=${encodeURIComponent(currentDateTime)}` +
                `&user=${encodeURIComponent(currentUserLogin)}`;

            this.logger.log(`${currentUserLogin} à ${currentDateTime} - URL de redirection construite (longueur: ${redirectUrl.length})`);
            this.logger.log(`${currentUserLogin} à ${currentDateTime} - Redirection vers le frontend: ${frontendUrl}/#/docusign-auth`);

            // Rediriger vers le frontend
            return res.redirect(redirectUrl);

        } catch (error) {
            const currentDateTime = '2025-04-27 09:46:19';
            const currentUserLogin = 'nesssim';

            this.logger.error(`${currentUserLogin} à ${currentDateTime} - Erreur lors du traitement du callback: ${error.message}`);
            this.logger.error(`${currentUserLogin} à ${currentDateTime} - Stack trace: ${error.stack}`);

            // Récupérer l'URL du frontend depuis la configuration
            const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

            // Construire une URL de redirection d'erreur pour le frontend
            // IMPORTANT: Noter le #/ ajouté dans l'URL pour le routage côté client
            const errorUrl = `${frontendUrl}/#/docusign-auth-error?` +
                `error=${encodeURIComponent(error.message)}` +
                `&code=${encodeURIComponent(code || 'non fourni')}` +
                `&state=${encodeURIComponent(state || 'non fourni')}` +
                `&timestamp=${encodeURIComponent(currentDateTime)}` +
                `&user=${encodeURIComponent(currentUserLogin)}`;

            this.logger.error(`${currentUserLogin} à ${currentDateTime} - Redirection vers page d'erreur: ${frontendUrl}/#/docusign-auth-error`);

            return res.redirect(errorUrl);
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

    /**
     * Helper pour extraire le JWT token
     */
    private extractJwtToken(req: Request): string {
        let jwtToken: string | undefined;

        if (req.cookies && req.cookies['docusign_auth']) {
            jwtToken = req.cookies['docusign_auth'];
            this.logger.log('Token trouvé dans les cookies');
        } else if (req.headers.authorization && req.headers.authorization.toString().startsWith('Bearer ')) {
            jwtToken = req.headers.authorization.toString().substring(7);
            this.logger.log('Token trouvé dans l\'en-tête Authorization');
        }

        if (!jwtToken) {
            this.logger.error('Aucun token JWT trouvé');
            throw new Error('Non authentifié');
        }

        return jwtToken;
    }

    /**
     * Helper pour extraire l'utilisateur depuis la requête
     */
    private getUserFromRequest(req: Request): JWTPayload {
        return (req as any).user as JWTPayload;
    }

    /**
     * Crée une enveloppe pour signature embarquée (sans notification email)
     */
    // @UseGuards(JwtAuthGuard, PermissionGuard) 
    @Post('create-embedded-envelope')
    async createEmbeddedEnvelope(
        @Body() data: {
            documentBase64: string;
            signerEmail: string;
            signerName: string;
            title: string;
        },
        @Req() req: Request,
    ) {
        try {
            // 1. Extraire le token JWT d'application
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.toString().startsWith('Bearer ')) {
                throw new Error('Token d\'application non fourni ou format invalide');
            }

            const appJwt = authHeader.toString().substring(7);
            let userId: string;

            try {
                // Décoder le token JWT d'application pour obtenir l'userId
                const appTokenDecoded = this.jwtService.verify(appJwt);
                userId = appTokenDecoded.userId;

                this.logger.log(`Utilisateur authentifié: ${userId}`);
            } catch (error) {
                this.logger.error(`Erreur de décodage du token d'application: ${error.message}`);
                throw new Error('Token d\'application invalide');
            }

            // 2. Extraire le token DocuSign de l'en-tête X-DocuSign-Token
            const docusignHeader = req.headers['x-docusign-token'];
            if (!docusignHeader) {
                throw new Error('Token DocuSign non fourni');
            }

            const docusignJwt = docusignHeader.toString().startsWith('Bearer ')
                ? docusignHeader.toString().substring(7)
                : docusignHeader.toString();

            let docusignToken: string;
            let accountId: string;

            try {
                // Décoder le token JWT DocuSign
                const docusignDecoded = this.jwtService.verify(docusignJwt);
                docusignToken = docusignDecoded.docusignToken;
                accountId = docusignDecoded.docusignAccountId;

                if (!docusignToken || !accountId) {
                    throw new Error('Token DocuSign invalide ou incomplet');
                }

                this.logger.log(`Token DocuSign valide, accountId: ${accountId}`);
            } catch (error) {
                this.logger.error(`Erreur de décodage du token DocuSign: ${error.message}`);
                throw new Error('Token DocuSign invalide');
            }

            // 3. Créer l'enveloppe avec les informations validées
            const envelopeId = await this.docusignService.createEnvelopeForEmbeddedSigning(
                docusignToken,
                data.documentBase64,
                data.signerEmail,
                data.signerName,
                data.title,
                '1000', // clientUserId fixe
                accountId
            );

            // 4. Enregistrer dans l'historique avec l'userId validé
            await this.signatureHistoryService.create({
                envelopeId,
                userId: userId,
                signerEmail: data.signerEmail,
                signerName: data.signerName,
                title: data.title
            });

            return {
                success: true,
                envelopeId,
                userId: userId,
                message: "Enveloppe créée avec succès pour signature embarquée"
            };
        } catch (error) {
            this.logger.error(`Erreur lors de la création de l'enveloppe: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Génère l'URL de signature embarquée pour une enveloppe existante
     */
    @Post('embedded-signing')
    async getEmbeddedSigningUrl(
        @Body() data: {
            envelopeId: string;  // ID obtenu de l'étape précédente
            signerEmail: string;
            signerName: string;
            returnUrl: string;
        },
        @Req() req: Request,
    ) {
        try {
            // Extraction du token DocuSign (même logique que précédemment)
            const docusignHeader = req.headers['x-docusign-token'];
            if (!docusignHeader) {
                throw new Error('Token DocuSign non fourni');
            }

            const docusignJwt = docusignHeader.toString().startsWith('Bearer ')
                ? docusignHeader.toString().substring(7)
                : docusignHeader.toString();

            // Décoder le token JWT DocuSign
            const decodedDocusign = this.jwtService.verify(docusignJwt);
            const token = decodedDocusign.docusignToken;
            const accountId = decodedDocusign.docusignAccountId;

            if (!token || !accountId) {
                throw new Error('Token DocuSign invalide ou incomplet');
            }

            // Générer l'URL de signature
            const signingUrl = await this.docusignService.createEmbeddedSigningUrl(
                token,
                data.envelopeId,
                accountId,
                data.signerEmail,
                data.signerName,
                data.returnUrl || `${this.configService.get<string>('FRONTEND_URL')}/signing-complete`,
                '1000'  // Même clientUserId que celui utilisé lors de la création de l'enveloppe
            );

            return {
                success: true,
                signingUrl,
                envelopeId: data.envelopeId
            };
        } catch (error) {
            this.logger.error(`Erreur lors de la création de l'URL de signature: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
    /**
     * Récupère l'état d'une enveloppe
     */
    @UseGuards(JwtAuthGuard, PermissionGuard) // Ajout des guards pour l'authentification
    @Get('envelope-status/:envelopeId')
    async checkEnvelopeStatus(
        @Param('envelopeId') envelopeId: string,
        @Req() req: Request,
    ) {
        try {
            // Extraction du token DocuSign
            const jwtToken = this.extractJwtToken(req);
            const decoded = this.jwtService.verify(jwtToken);

            const token = decoded.docusignToken;
            const accountId = decoded.docusignAccountId;

            // Récupération de l'utilisateur depuis le token JWT de l'application
            const user = this.getUserFromRequest(req);
            const userId = user.userId;

            this.logger.log(`Vérification de l'état de l'enveloppe ${envelopeId} par l'utilisateur ${userId}`);

            // Vérifier l'état de l'enveloppe
            const status = await this.docusignService.getEnvelopeStatus(
                token,
                envelopeId,
                accountId
            );

            return {
                success: true,
                userId: userId,
                status: status.status,
                created: status.createdDateTime,
                sent: status.sentDateTime,
                delivered: status.deliveredDateTime,
                completed: status.completedDateTime,
                declined: status.declinedDateTime,
                recipients: status.recipients
            };
        } catch (error) {
            this.logger.error(`Erreur lors de la vérification de l'état: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Télécharge un document signé
     */
    @UseGuards(JwtAuthGuard, PermissionGuard) // Ajout des guards pour l'authentification
    @Get('download-document/:envelopeId')
    async downloadSignedDocument(
        @Param('envelopeId') envelopeId: string,
        @Req() req: Request,
        @Res() res: Response,
    ) {
        try {
            // Extraction du token DocuSign
            const jwtToken = this.extractJwtToken(req);
            const decoded = this.jwtService.verify(jwtToken);

            const token = decoded.docusignToken;
            const accountId = decoded.docusignAccountId;

            // Récupération de l'utilisateur depuis le token JWT de l'application
            const user = this.getUserFromRequest(req);
            const userId = user.userId;

            this.logger.log(`Téléchargement du document ${envelopeId} par l'utilisateur ${userId}`);

            // Récupérer le document signé
            const documentBuffer = await this.docusignService.getSignedDocument(
                token,
                envelopeId,
                accountId
            );

            // Enregistrer l'action dans l'historique si nécessaire
            await this.signatureHistoryService.updateDocumentAccess(envelopeId, userId);

            // Envoyer le document en réponse
            res.set({
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="document_signe_${envelopeId}_user_${userId}.pdf"`,
                'Content-Length': documentBuffer.length,
            });

            res.send(documentBuffer);
        } catch (error) {
            this.logger.error(`Erreur lors du téléchargement du document: ${error.message}`);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Récupère l'historique des signatures d'un utilisateur
     */
    @UseGuards(JwtAuthGuard, PermissionGuard) // Ajout des guards pour l'authentification
    @Get('history')
    async getSignatureHistory(@Req() req: Request) {
        try {
            // Récupération de l'utilisateur depuis le token JWT de l'application
            const user = this.getUserFromRequest(req);
            const userId = user.userId;

            // Récupérer l'historique des signatures pour cet utilisateur
            const signatures = await this.signatureHistoryService.findByUserId(userId);

            return {
                success: true,
                userId: userId,
                signatures
            };
        } catch (error) {
            this.logger.error(`Erreur lors de la récupération de l'historique: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Endpoint qui gère le retour après la signature DocuSign
     */
    @Get('signing-complete')
    async signingComplete(
        @Query('event') event: string,
        @Query('envelopeId') envelopeId: string,
        @Res() res: Response
    ) {
        try {
            this.logger.log(`Signature complétée: ${event}, Envelope ID: ${envelopeId}`);

            // Si vous avez une interface utilisateur frontend, vous pouvez rediriger vers celle-ci
            if (process.env.FRONTEND_URL) {
                return res.redirect(
                    `${process.env.FRONTEND_URL}/signature-confirmation?status=success&event=${event}&envelopeId=${envelopeId}`
                );
            }

            // Ou simplement renvoyer une page HTML de confirmation
            const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Signature Complétée</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            text-align: center;
                            margin-top: 50px;
                        }
                        .success-message {
                            color: #2ecc71;
                            font-size: 24px;
                        }
                        .envelope-info {
                            margin-top: 20px;
                            font-size: 16px;
                        }
                        .back-button {
                            display: inline-block;
                            margin-top: 30px;
                            padding: 10px 20px;
                            background-color: #3498db;
                            color: white;
                            text-decoration: none;
                            border-radius: 4px;
                        }
                    </style>
                </head>
                <body>
                    <div class="success-message">
                        <h1>Signature complétée avec succès!</h1>
                    </div>
                    <div class="envelope-info">
                        ${envelopeId ? `Identifiant d'enveloppe: ${envelopeId}` : ''}
                    </div>
                    <a href="/" class="back-button">Retour à l'application</a>
                    
                    <script>
                        // Si cette page est dans une iframe, notifier le parent
                        if (window.parent && window !== window.parent) {
                            window.parent.postMessage({
                                status: 'signing_complete',
                                envelopeId: '${envelopeId}',
                                event: '${event}'
                            }, '*');
                            
                            // Fermer cette fenêtre après quelques secondes si c'est une popup
                            setTimeout(function() {
                                window.close();
                            }, 3000);
                        }
                    </script>
                </body>
                </html>
            `;

            return res.type('html').send(html);
        } catch (error) {
            this.logger.error(`Erreur lors du traitement de la fin de signature: ${error.message}`);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
}