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
const extraOrigins = process.env.ALLOW_CORS ? process.env.ALLOW_CORS.split(',') : [];
const allowedOrigins = ['https://regextester.github.io', ...extraOrigins];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json({ limit: '1kb' }));

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
