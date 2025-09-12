const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mammoth = require('mammoth');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Serve static files (our simple HTML frontend)
app.use(express.static('public'));

// Main formatting endpoint
app.post('/api/format', upload.single('file'), async (req, res) => {
  try {
    console.log('Received formatting request');
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { style } = req.body;
    console.log(`Formatting with style: ${style}`);

    // Read the uploaded file
    const filePath = req.file.path;
    
    // Extract text from the docx file
    const result = await mammoth.extractRawText({ path: filePath });
    const originalText = result.value;
    console.log('Extracted text length:', originalText.length);

    // Process the text - find URLs and replace with citations
    const processedText = processTextForCitations(originalText);

    // Create a new document with proper formatting
    const formattedDoc = createFormattedDocument(processedText, style);

    // Generate the new docx file
    const buffer = await Packer.toBuffer(formattedDoc);

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    // Send the formatted document
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename=formatted-document.docx');
    res.send(buffer);

    console.log('Document formatted and sent successfully');

  } catch (error) {
    console.error('Error formatting document:', error);
    
    // Clean up uploaded file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: 'Failed to format document: ' + error.message });
  }
});

// Function to process text and replace URLs with citations
function processTextForCitations(text) {
  // Simple URL regex
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  let citationCounter = 1;
  
  const processedText = text.replace(urlRegex, (url) => {
    // Extract domain for citation
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      return `(${domain}, 2024)`;
    } catch {
      return `(Source ${citationCounter++}, 2024)`;
    }
  });
  
  return processedText;
}

// Function to create a formatted document
function createFormattedDocument(text, style) {
  // Split text into paragraphs
  const paragraphs = text.split('\n').filter(p => p.trim().length > 0);
  
  const docParagraphs = paragraphs.map(paragraphText => {
    return new Paragraph({
      children: [
        new TextRun({
          text: paragraphText,
          font: "Times New Roman",
          size: 24, // 12pt = 24 half-points
        }),
      ],
      spacing: {
        line: 480, // Double spacing (240 = single, 480 = double)
        after: 240, // Space after paragraph
      },
    });
  });

  // Add a title based on the style
  const titleText = `Document Formatted in ${style.toUpperCase()} Style`;
  const titleParagraph = new Paragraph({
    children: [
      new TextRun({
        text: titleText,
        font: "Times New Roman",
        size: 28, // 14pt for title
        bold: true,
      }),
    ],
    heading: HeadingLevel.TITLE,
    spacing: {
      line: 480,
      after: 480,
    },
  });

  return new Document({
    sections: [
      {
        properties: {},
        children: [titleParagraph, ...docParagraphs],
      },
    ],
  });
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'FormatGenius Lite backend is running' });
});

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Create public directory if it doesn't exist
if (!fs.existsSync('public')) {
  fs.mkdirSync('public');
}

app.listen(PORT, () => {
  console.log(`FormatGenius Lite backend running on http://localhost:${PORT}`);
  console.log(`Frontend available at http://localhost:${PORT}`);
});