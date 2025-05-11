
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

  // Callback route reste sans guard car elle est appelée par DocuSign
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

      const expiresIn = tokenResponse.expiresIn || 3600;
      const accessToken = tokenResponse.accessToken;
      const expiryDate = Date.now() + (expiresIn * 1000);

      // Échapper les variables pour les utiliser dans le JavaScript
      const jwtTokenEscaped = JSON.stringify(jwtToken);
      const accessTokenEscaped = JSON.stringify(accessToken);
      const accountIdEscaped = JSON.stringify(accountId || "");
      const expiryEscaped = JSON.stringify(expiryDate.toString());

      // MODIFICATION: Créez une version raccourcie du token brut pour l'affichage
      const shortAccessToken = accessToken.length > 20
        ? accessToken.substring(0, 10) + '...' + accessToken.substring(accessToken.length - 10)
        : accessToken;

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
                .container { max-width: 800px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
                .success { color: green; }
                .token { background: #f5f5f5; padding: 10px; border-radius: 3px; word-break: break-all; text-align: left; margin-bottom: 15px; font-size: 12px; }
                .token-summary { background: #e8f5e9; padding: 10px; border-radius: 3px; margin-bottom: 15px; }
                button { background: #4CAF50; color: white; padding: 10px 15px; border: none; border-radius: 4px; cursor: pointer; margin: 5px; }
                .message { padding: 10px; margin: 15px 0; border-radius: 4px; }
                .success-msg { background-color: #e8f5e9; color: #2e7d32; border: 1px solid #a5d6a7; }
                .error-msg { background-color: #ffebee; color: #c62828; border: 1px solid #ef9a9a; }
                .close-btn { background: #f44336; width: 100%; margin-top: 15px; }
                .warning { background-color: #fff3e0; color: #e65100; padding: 10px; border-radius: 4px; border: 1px solid #ffb74d; margin: 15px 0; }
                .instructions { background-color: #e3f2fd; padding: 15px; border-radius: 4px; text-align: left; margin: 15px 0; border: 1px solid #90caf9; }
                .tab-container { display: flex; margin-bottom: -1px; }
                .tab { padding: 10px 15px; cursor: pointer; border: 1px solid #ddd; border-bottom: none; border-radius: 5px 5px 0 0; }
                .tab.active { background-color: #f5f5f5; }
                .tab-content { display: none; }
                .tab-content.active { display: block; }
                .code { font-family: monospace; }
              </style>
            </head>
            <body>
              <div class="container">
                <h1 class="success">Authentification DocuSign Réussie!</h1>
                <p>Votre application est maintenant authentifiée avec DocuSign.</p>
                
                <div id="status-message" class="message">
                  En attente de synchronisation avec l'application principale...
                </div>
                
                <div class="warning">
                  <strong>IMPORTANT:</strong> Pour les requêtes à l'API DocuSign, utilisez le <strong>JWT</strong> ci-dessous dans l'en-tête <code>X-DocuSign-Token</code> et non le token brut.
                </div>
                
                <div class="tab-container">
                  <div class="tab active" onclick="switchTab('jwt')">JWT (À UTILISER)</div>
                  <div class="tab" onclick="switchTab('raw')">Token Brut (Info seulement)</div>
                  <div class="tab" onclick="switchTab('account')">Informations de compte</div>
                </div>
                
                <div id="jwt-tab" class="tab-content active">
                  <h3>JWT DocuSign à utiliser dans X-DocuSign-Token: Bearer [jwt]</h3>
                  <div class="token-summary">
                    <strong>Format d'en-tête pour les requêtes:</strong><br>
                    <code class="code">X-DocuSign-Token: Bearer ${jwtToken}</code>
                  </div>
                  <div class="token" id="jwt-token">${jwtToken}</div>
                  <button id="copyJwtBtn">Copier le JWT</button>
                </div>
                
                <div id="raw-tab" class="tab-content">
                  <h3>Token DocuSign brut (pour information uniquement)</h3>
                  <div class="token-summary">
                    <strong>Token raccourci:</strong> ${shortAccessToken}<br>
                    <strong>Longueur:</strong> ${accessToken.length} caractères
                  </div>
                  <div class="token" id="raw-token">${accessToken}</div>
                  <button id="copyRawBtn">Copier le token brut</button>
                </div>
                
                <div id="account-tab" class="tab-content">
                  <h3>Informations du compte DocuSign</h3>
                  <div class="token">
                    <strong>ID de compte:</strong> ${accountId || "Non disponible"}<br>
                    <strong>Expiration du token:</strong> ${new Date(expiryDate).toLocaleString()}<br>
                    <strong>Durée de validité:</strong> ${expiresIn} secondes
                  </div>
                </div>
                
                <div class="instructions">
                  <h3>Instructions pour Postman:</h3>
                  <ol>
                    <li>Ajoutez l'en-tête <code>X-DocuSign-Token: Bearer [jwt]</code> où [jwt] est le JWT affiché ci-dessus</li>
                    <li>Ajoutez également votre en-tête d'autorisation standard <code>Authorization: Bearer [votre_token_app]</code></li>
                    <li>Envoyez votre requête à l'endpoint <code>/docusign/create-embedded-envelope</code></li>
                  </ol>
                </div>
                
                <div>
                  <button id="sendBtn">Envoyer les tokens à l'application</button>
                </div>
                
                <button class="close-btn" id="closeBtn">Fermer cette fenêtre</button>
                
                <p style="margin-top: 20px;">Ces tokens ont été stockés dans localStorage et le SecureStorage</p>
              </div>
    
              <script>
                // Définir toutes les fonctions avant l'utilisation
                function copyToClipboard(elementId) {
                  const text = document.getElementById(elementId).textContent;
                  
                  if (navigator.clipboard) {
                    navigator.clipboard.writeText(text)
                      .then(function() {
                        updateStatus("✓ Copié dans le presse-papiers", "success");
                      })
                      .catch(function(err) {
                        updateStatus("❌ Erreur lors de la copie: " + err, "error");
                      });
                  } else {
                    // Méthode de fallback
                    const textarea = document.createElement('textarea');
                    textarea.value = text;
                    document.body.appendChild(textarea);
                    textarea.select();
                    
                    try {
                      document.execCommand('copy');
                      updateStatus("✓ Copié dans le presse-papiers", "success");
                    } catch (err) {
                      updateStatus("❌ Erreur lors de la copie: " + err, "error");
                    }
                    
                    document.body.removeChild(textarea);
                  }
                }
                
                function switchTab(tabName) {
                  // Désactiver tous les tabs et contenus
                  document.querySelectorAll('.tab').forEach(tab => {
                    tab.classList.remove('active');
                  });
                  document.querySelectorAll('.tab-content').forEach(content => {
                    content.classList.remove('active');
                  });
                  
                  // Activer le tab et contenu sélectionnés
                  document.querySelector('.tab[onclick*="' + tabName + '"]').classList.add('active');
                  document.getElementById(tabName + '-tab').classList.add('active');
                }
                
                function sendToken() {
                  try {
                    if (window.opener) {
                      // Envoyer le token avec toutes les clés requises pour le stockage sécurisé
                      window.opener.postMessage({
                        type: 'DOCUSIGN_TOKEN',
                        token: ${accessTokenEscaped},          // Token d'accès brut pour l'API DocuSign
                        jwt: ${jwtTokenEscaped},               // JWT pour l'authentification
                        accountId: ${accountIdEscaped},        // ID de compte DocuSign
                        expiresIn: ${expiresIn},               // Durée d'expiration en secondes
                        expiry: ${expiryEscaped}               // Date d'expiration en timestamp
                      }, '*');
                      
                      updateStatus("✓ Tokens envoyés avec succès! Fermeture de la fenêtre...", "success");
                      
                      setTimeout(function() {
                        closeWindow();
                      }, 2000);
                    } else {
                      updateStatus("⚠️ Impossible d'envoyer les tokens automatiquement. La fenêtre parent n'est pas accessible.", "error");
                    }
                  } catch (err) {
                    updateStatus("❌ Erreur: " + err.message, "error");
                    console.error('Erreur lors de l\\'envoi du token:', err);
                  }
                }
                
                function closeWindow() {
                  window.close();
                }
                
                function updateStatus(message, type) {
                  const statusElement = document.getElementById('status-message');
                  statusElement.textContent = message;
                  statusElement.className = "message " + (type === "success" ? "success-msg" : "error-msg");
                }
                
                // Stocker les tokens dans localStorage (pour la compatibilité)
                function storeTokensInLocalStorage() {
                  try {
                    // Stocker les tokens avec les clés attendues par le frontend
                    localStorage.setItem('docusign_jwt', ${jwtTokenEscaped});
                    localStorage.setItem('docusign_token', ${accessTokenEscaped});
                    localStorage.setItem('docusign_account_id', ${accountIdEscaped});
                    localStorage.setItem('docusign_expiry', ${expiryEscaped});
                    
                    console.log('Tokens DocuSign stockés dans localStorage avec les clés attendues par le frontend');
                  } catch (err) {
                    console.error('Erreur lors du stockage des tokens dans localStorage:', err);
                  }
                }
                
                window.addEventListener('DOMContentLoaded', function() {
                  try {
                    // Stocker les tokens dans localStorage
                    storeTokensInLocalStorage();
                    
                    // Ajout des écouteurs d'événements
                    document.getElementById('copyJwtBtn').addEventListener('click', function() {
                      copyToClipboard('jwt-token');
                    });
                    document.getElementById('copyRawBtn').addEventListener('click', function() {
                      copyToClipboard('raw-token');
                    });
                    document.getElementById('sendBtn').addEventListener('click', sendToken);
                    document.getElementById('closeBtn').addEventListener('click', closeWindow);
            
                    // Envoyer automatiquement le token après un délai
                    setTimeout(function() {
                      sendToken();
                    }, 1000);
                  } catch (err) {
                    updateStatus("❌ Erreur d'initialisation: " + err.message, "error");
                    console.error('Erreur d\\'initialisation:', err);
                  }
                });
              </script>
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
      documentName?: string; // NOUVEAU: Nom du document avec extension
      documentType?: string; // NOUVEAU: Type du document (pdf, docx, etc.)
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

      // NOUVEAU: Déterminer le type de document et le nom
      const documentType = data.documentType || this.detectDocumentType(data.documentBase64);
      const documentName = data.documentName || `${data.title}.${documentType}`;

      this.logger.log(`Création d'une enveloppe pour ${data.signerName} (${data.signerEmail})`);
      this.logger.log(`Type de document détecté: ${documentType}, Nom du document: ${documentName}`);

      // 3. Créer l'enveloppe avec les informations validées
      const envelopeId = await this.docusignService.createEnvelopeForEmbeddedSigning(
        docusignToken,
        data.documentBase64,
        data.signerEmail,
        data.signerName,
        data.title,
        '1000', // clientUserId fixe
        accountId,
        documentName, // NOUVEAU: Passer le nom du document
        documentType  // NOUVEAU: Passer le type du document
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
 * Détecte le type de document à partir des premiers caractères du base64
 */
private detectDocumentType(base64: string): string {
    // PDF: Commence souvent par "JVBERi"
    if (base64.startsWith('JVBERi')) {
        return 'pdf';
    }
    
    // DOCX/ZIP: Commence souvent par "UEsD" (PK header)
    if (base64.startsWith('UEsD')) {
        return 'docx';
    }
    
    // Sinon, PDF par défaut comme c'est le format le plus pris en charge
    return 'pdf';
}
  /**
   * Génère l'URL de signature embarquée pour une enveloppe existante
   */
  @Post('embedded-signing')
  async getEmbeddedSigningUrl(
    @Body() data: {
      envelopeId: string;
      signerEmail: string;
      signerName: string;
      returnUrl: string;
    },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      // Extraction du token DocuSign
      const docusignHeader = req.headers['x-docusign-token'];
      if (!docusignHeader) {
        return res.status(401).json({
          success: false,
          error: 'Token DocuSign non fourni'
        });
      }

      const docusignJwt = docusignHeader.toString().startsWith('Bearer ')
        ? docusignHeader.toString().substring(7)
        : docusignHeader.toString();

      let token: string;
      let accountId: string;

      try {
        // Décoder le token JWT DocuSign
        const decodedDocusign = this.jwtService.verify(docusignJwt);
        token = decodedDocusign.docusignToken;
        accountId = decodedDocusign.docusignAccountId;

        if (!token || !accountId) {
          return res.status(401).json({
            success: false,
            error: 'Token DocuSign invalide ou incomplet'
          });
        }
      } catch (error) {
        this.logger.error(`Erreur de décodage du token DocuSign: ${error.message}`);
        return res.status(401).json({
          success: false,
          error: 'Token DocuSign invalide'
        });
      }

      try {
        // Générer l'URL de signature
        const signingUrl = await this.docusignService.createEmbeddedSigningUrl(
          token,
          data.envelopeId,
          accountId,
          data.signerEmail,
          data.signerName,
          data.returnUrl || `${this.configService.get<string>('FRONTEND_URL')}/signing-complete`,
          '1000'
        );

        return res.status(200).json({
          success: true,
          signingUrl,
          envelopeId: data.envelopeId
        });
      } catch (error) {
        // Si l'erreur est liée à un problème d'authentification
        if (error.message &&
          (error.message.includes('authentication') ||
            error.message.includes('token') ||
            error.message.includes('unauthorized') ||
            error.message.includes('access') ||
            error.message.includes('expire') ||
            error.status === 401)) {

          this.logger.error(`Erreur d'authentification DocuSign: ${error.message}`);
          return res.status(401).json({
            success: false,
            error: 'Token DocuSign invalide ou expiré'
          });
        }

        // Autres erreurs
        this.logger.error(`Erreur lors de la création de l'URL de signature: ${error.message}`);
        return res.status(500).json({
          success: false,
          error: error.message
        });
      }
    } catch (error) {
      this.logger.error(`Erreur générale lors de la création de l'URL de signature: ${error.message}`);
      return res.status(500).json({
        success: false,
        error: error.message
      });
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
}
