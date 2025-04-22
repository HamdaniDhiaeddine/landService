import { registerAs } from '@nestjs/config';

export default registerAs('docusign', () => ({
  integrationKey: process.env.DOCUSIGN_INTEGRATION_KEY || 'd956403b-d435-4cca-9763-53489f61dd6c',
  clientSecret: process.env.DOCUSIGN_CLIENT_SECRET || '35df48ab-cf3e-4803-9da0-2b38435467e2',
  redirectUri: process.env.DOCUSIGN_REDIRECT_URI || 'http://localhost:3000/docusign/callback',
  authServer: process.env.DOCUSIGN_AUTH_SERVER || 'https://account-d.docusign.com',
  apiBasePath: process.env.DOCUSIGN_API_BASE_PATH || 'https://demo.docusign.net/restapi',
  accountId: process.env.DOCUSIGN_ACCOUNT_ID || '',
}));