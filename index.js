const express = require('express');
require('dotenv').config();
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const sequelize = require('./database');
const PptxParser = require('node-pptx-parser').default;

const app = express();
app.use(cors());
app.use(express.json());
const port = 5000;

// Connect to PostgreSQL
sequelize.authenticate()
  .then(async () => {
    console.log('Connection has been established successfully.');
    await sequelize.sync();
    console.log('Database synchronized.');
  })
  .catch(err => console.error('Unable to connect to the database:', err));
const Thesis = require('./models/Thesis');

const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 requests per hour
  message: 'Too many requests from this IP, please try again after an hour'
});

app.use('/upload', limiter);
app.use('/analyze', limiter);

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const s3 = new AWS.S3();

const upload = multer({ storage: multer.memoryStorage() });

// Define the file upload endpoint
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: `${Date.now()}-${req.file.originalname}`,
    Body: req.file.buffer,
    ContentType: req.file.mimetype
  };

  try {
    // Write buffer to a temp file for parser
    const tempPath = path.join(__dirname, 'uploads', `${Date.now()}-${req.file.originalname}`);
    fs.writeFileSync(tempPath, req.file.buffer);

    const parser = new PptxParser(tempPath);
    const textContent = await parser.extractText();
    const fullText = textContent.map(slide => slide.text.join('\n')).join('\n\n');

    // Upload original file buffer to S3
    await s3.upload(params).promise();

    const url = s3.getSignedUrl('getObject', {
      Bucket: params.Bucket,
      Key: params.Key,
      Expires: 24 * 60 * 60 // 24 hours
    });

    // Clean up temp file
    fs.unlink(tempPath, () => {});

    res.send({ message: 'File uploaded and parsed successfully', text: fullText, downloadUrl: url });
  } catch (error) {
    console.error('Error uploading or parsing PPTX file:', error);
    res.status(500).send({ message: 'Error uploading or parsing PPTX file' });
  }
});

// Use OpenAI SDK against xAI's OpenAI-compatible API
const OpenAI = require('openai');

app.post('/analyze', async (req, res) => {
  console.log('Request body:', req.body);
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Text is required for analysis.' });
  }

  try {
    let thesisText;
    const key = process.env.XAI_API_KEY;
    const keyLooksValid = key && key.startsWith('xai-');
    if (!keyLooksValid) {
      thesisText = `Investment Thesis (Placeholder):\nThe deck suggests a solution targeting a clear market need. Initial traction and defined target market indicate potential for growth. Recommend continued validation and iterative go-to-market based on presented metrics.`;
    } else {
      const client = new OpenAI({ apiKey: key, baseURL: 'https://api.x.ai/v1' });
      const prompt = `You are a professional VC analyst. Based on the following pitch deck text, craft a concise investment thesis (250-400 words) covering Market, Problem, Solution, Traction, Moat, GTM, Risks, and Financial Outlook. Keep it objective and actionable.\n\nTEXT:\n${text}`;
      try {
        const completion = await client.chat.completions.create({
          model: 'grok-2-mini',
          messages: [
            { role: 'system', content: 'You are a rigorous VC analyst providing structured investment theses.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
        });
        thesisText = (completion && completion.choices && completion.choices[0] && completion.choices[0].message && completion.choices[0].message.content) || '';
        if (!thesisText) throw new Error('Empty xAI response');
      } catch (modelErr) {
        console.error('xAI invocation failed, using fallback:', modelErr);
        thesisText = `Investment Thesis (Fallback):\n${text.slice(0, 600)}...`;
      }
    }

    // Generate PDF and upload to S3, return signed URL
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument();
    const buffers = [];
    const pdfBuffer = await new Promise((resolve, reject) => {
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      doc.fontSize(25).text('Investment Thesis Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(16).text(thesisText);
      doc.end();
    });

    const reportKey = `reports/report-${Date.now()}.pdf`;
    await s3.upload({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: reportKey,
      Body: pdfBuffer,
      ContentType: 'application/pdf'
    }).promise();

    const downloadUrl = s3.getSignedUrl('getObject', {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: reportKey,
      Expires: 24 * 60 * 60
    });

    res.json({ downloadUrl });
  } catch (error) {
    console.error('Error during analysis:', error);
    res.status(500).json({ error: 'An error occurred during analysis.' });
  }
});

const PDFDocument = require('pdfkit');

app.get('/report/:id', async (req, res) => {
  try {
    const thesis = await Thesis.findByPk(req.params.id);
    if (!thesis) {
      return res.status(404).send('Report not found');
    }

    const doc = new PDFDocument();
    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      let pdfData = Buffer.concat(buffers);
      res.writeHead(200, {
        'Content-Length': Buffer.byteLength(pdfData),
        'Content-Type': 'application/pdf',
        'Content-disposition': 'attachment;filename=report.pdf',
      }).end(pdfData);
    });

    doc.fontSize(25).text('Investment Thesis Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(16).text(thesis.thesis);
    doc.end();

  } catch (error) {
    console.error('Error generating PDF report:', error);
    res.status(500).send('Error generating PDF report');
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});