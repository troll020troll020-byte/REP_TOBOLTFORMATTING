const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mammoth = require('mammoth');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');
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
  console.log('🔥 FORMAT REQUEST RECEIVED');
  
  try {
    if (!req.file) {
      console.log('❌ No file uploaded');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { style } = req.body;
    console.log(`📝 File received: ${req.file.originalname}`);
    console.log(`🎨 Style requested: ${style}`);
    console.log(`📊 File size: ${req.file.size} bytes`);

    // Read the uploaded file
    const filePath = req.file.path;
    console.log(`📂 Processing file at: ${filePath}`);
    
    // Extract text from the docx file
    console.log('🔍 Extracting text from DOCX...');
    const result = await mammoth.extractRawText({ path: filePath });
    const originalText = result.value;
    console.log(`📄 Extracted text length: ${originalText.length} characters`);
    console.log(`📄 First 100 characters: "${originalText.substring(0, 100)}..."`);

    if (!originalText || originalText.trim().length === 0) {
      console.log('❌ No text extracted from document');
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'Could not extract text from document' });
    }

    // Process the text - find URLs and replace with citations
    console.log('🔗 Processing URLs for citations...');
    const processedText = processTextForCitations(originalText);
    console.log(`🔗 Text after URL processing: ${processedText.length} characters`);

    // Create a new document with proper formatting
    console.log('📝 Creating formatted document...');
    const formattedDoc = createFormattedDocument(processedText, style);
    console.log('✅ Document structure created');

    // Generate the new docx file
    console.log('📦 Generating DOCX buffer...');
    const buffer = await Packer.toBuffer(formattedDoc);
    console.log(`📦 Generated buffer size: ${buffer.length} bytes`);

    // Clean up uploaded file
    fs.unlinkSync(filePath);
    console.log('🧹 Cleaned up temporary file');

    // Send the formatted document
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename=formatted-document-${style}.docx`);
    res.send(buffer);

    console.log('🎉 Document formatted and sent successfully');

  } catch (error) {
    console.error('💥 ERROR formatting document:', error);
    console.error('💥 Stack trace:', error.stack);
    
    // Clean up uploaded file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: 'Failed to format document: ' + error.message });
  }
});

// Function to process text and replace URLs with citations
function processTextForCitations(text) {
  console.log('🔗 Starting URL processing...');
  
  // Simple URL regex
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  let citationCounter = 1;
  const urls = text.match(urlRegex) || [];
  
  console.log(`🔗 Found ${urls.length} URLs to replace`);
  
  const processedText = text.replace(urlRegex, (url) => {
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      console.log(`🔗 Replacing ${url} with (${domain}, 2024)`);
      return `(${domain}, 2024)`;
    } catch {
      console.log(`🔗 Replacing ${url} with (Source ${citationCounter}, 2024)`);
      return `(Source ${citationCounter++}, 2024)`;
    }
  });
  
  console.log('🔗 URL processing complete');
  return processedText;
}

// Function to create a formatted document with proper styling
function createFormattedDocument(text, style) {
  console.log(`📝 Creating document with ${style} style...`);
  
  // Split text into paragraphs (split by double newlines or single newlines)
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  console.log(`📝 Split text into ${paragraphs.length} paragraphs`);
  
  // If no double newlines found, split by single newlines
  if (paragraphs.length === 1) {
    const singleLineParagraphs = text.split('\n').filter(p => p.trim().length > 0);
    paragraphs.splice(0, 1, ...singleLineParagraphs);
    console.log(`📝 Re-split into ${paragraphs.length} single-line paragraphs`);
  }

  // Create document paragraphs with proper formatting
  const docParagraphs = paragraphs.map((paragraphText, index) => {
    console.log(`📝 Creating paragraph ${index + 1}: "${paragraphText.substring(0, 50)}..."`);
    
    return new Paragraph({
      children: [
        new TextRun({
          text: paragraphText.trim(),
          font: "Times New Roman",
          size: 24, // 12pt = 24 half-points
        }),
      ],
      spacing: {
        line: 480, // Double spacing (240 = single, 480 = double)
        after: 240, // Space after paragraph
      },
      alignment: AlignmentType.JUSTIFIED,
    });
  });

  // Add a title based on the style
  const titleText = `Document Formatted in ${style.toUpperCase()} Style`;
  console.log(`📝 Adding title: "${titleText}"`);
  
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
    alignment: AlignmentType.CENTER,
  });

  // Create the document with custom styles
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: "Times New Roman",
            size: 24,
          },
          paragraph: {
            spacing: {
              line: 480, // Double spacing
            },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,    // 1 inch = 1440 twips
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children: [titleParagraph, ...docParagraphs],
      },
    ],
  });

  console.log('📝 Document creation complete');
  return doc;
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  console.log('🏥 Health check requested');
  res.json({ status: 'OK', message: 'FormatGenius Lite backend is running' });
});

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
  console.log('📁 Created uploads directory');
}

// Create public directory if it doesn't exist
if (!fs.existsSync('public')) {
  fs.mkdirSync('public');
  console.log('📁 Created public directory');
}

app.listen(PORT, () => {
  console.log(`🚀 FormatGenius Lite backend running on http://localhost:${PORT}`);
  console.log(`🌐 Frontend available at http://localhost:${PORT}`);
  console.log('📋 Ready to format documents!');
});