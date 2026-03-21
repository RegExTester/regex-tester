import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { homeController } from './controllers/homeController.js';
import { regexController } from './controllers/regexController.js';
import { requestTimeout } from './middleware/requestTimeout.js';
import { openApiDocument } from './openapi.js';

const app = express();
const port = process.env.PORT || 5100;

// CORS
const allowedOrigins = process.env.ALLOW_CORS
  ? process.env.ALLOW_CORS.split(',')
  : ['http://localhost:5173', 'https://regextester.github.io'];

app.use(cors({
  origin: process.env.NODE_ENV === 'development' ? '*' : allowedOrigins,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json());

// Request timeout (5 seconds)
app.use('/api/regex', requestTimeout(5000));

// OpenAPI
app.get('/openapi/v1.json', (_req, res) => res.json(openApiDocument));
app.use('/scalar/v1', swaggerUi.serve, swaggerUi.setup(openApiDocument, {
  customSiteTitle: 'RegEx Tester API - Node.js',
}));

// Routes
app.get('/', homeController.redirect);
app.get('/api/version', homeController.version);
app.post('/api/regex', regexController.match);

app.listen(port, () => {
  console.log(`RegEx Tester API (Node.js) listening on http://localhost:${port}`);
});
