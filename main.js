const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const bwipjs = require('bwip-js');
const QRCode = require('qrcode');
require('dotenv').config();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 400,
    title: "Генератор пакетів штрих-кодів та QR-кодів",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
}

app.disableHardwareAcceleration();
app.whenReady().then(createWindow);

// Handle directory selection dialog
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.filePaths[0];
});

// Main Generation Logic
ipcMain.handle('generate-batch', async (event, data) => {
  const { name, batchNumber, amount, saveDir } = data;
  
  try {
    const sanitizedName = name.replace(/[^a-zA-Z0-9а-яА-ЯёЁ\s\-]/g, '').trim() || 'Без_Назви';
    const pdfPath = path.join(saveDir, `${sanitizedName}_${batchNumber}_barcodes.pdf`);
    const qrPath = path.join(saveDir, `${sanitizedName}_${batchNumber}_qr.jpg`);

    // --- CONFIGURABLE MARGINS & GEOMETRY ---
    const labelWidth = 113.04;  // 1.57 inches
    const labelHeight = 67.68; // 0.94 inches
    
    // Adjust these margins to control whitespace padding on borders
    const margins = { top: 3, bottom: 2, left: 4, right: 4 };
    const contentWidth = labelWidth - (margins.left + margins.right);
    const contentHeight = labelHeight - (margins.top + margins.bottom);

    // --- CONFIGURABLE FONT SIZES (BIGGER) ---
    const titleFontMax = 7;     // Was 6
    const titleFontMin = 5.5;   // Was 5
    const metaFontSize = 6;     // Was 5 (Controls Manufacturer, Batch, and Serial)

    const doc = new PDFDocument({ 
      size: [labelWidth, labelHeight], 
      margins: { top: 0, bottom: 0, left: 0, right: 0 } // Handle padding calculations manually for layout safety
    });
    
    const pdfStream = fs.createWriteStream(pdfPath);
    doc.pipe(pdfStream);

    // --- Register and apply local Unicode Font ---
    const fontPath = path.join(__dirname, 'fonts', 'arial.ttf');
    const boldFontPath = path.join(__dirname, 'fonts', 'arialbd.ttf');

    if (fs.existsSync(fontPath)) {
      doc.registerFont('Arial-Cyrillic', fontPath);
      doc.font('Arial-Cyrillic');
    } else {
      throw new Error(`Font asset missing at: ${fontPath}`);
    }

    if (!fs.existsSync(boldFontPath)) {
      throw new Error(`Missing bold font file at: ${boldFontPath}`);
    }
    doc.registerFont('Arial-Bold', boldFontPath);

    const barcodeList = [];

    for (let i = 1; i <= amount; i++) {
      const currentId = `${batchNumber}/${i}`;
      barcodeList.push(currentId);

      if (i > 1) {
        doc.addPage({ 
          size: [labelWidth, labelHeight], 
          margins: { top: 0, bottom: 0, left: 0, right: 0 } 
        });
      }

      // 1. --- Name Header ---
      const nameFontSize = name.length > 20 ? titleFontMin : titleFontMax;
      doc.fontSize(nameFontSize);
      doc.text(`${name}`, margins.left, margins.top, { width: contentWidth, align: 'center' });
      const nameHeight = doc.heightOfString(`${name}`, { width: contentWidth });

      // 2. --- Manufacturer Block ---
      const manufacturerText = `Виробник: ${process.env.MANUFACTURER_NAME || 'Компанія відсутня'}`;
      const manufacturerY = margins.top + nameHeight + 1; 
      doc.fontSize(metaFontSize).text(manufacturerText, margins.left, manufacturerY, { width: contentWidth, align: 'center' });
      const manufacturerHeight = doc.heightOfString(manufacturerText, { width: contentWidth });

      // 3. --- Footer Metadata (Pre-calculating from the bottom up to maximize space) ---
      doc.fontSize(metaFontSize);
      const serialText = `Серійний номер: ${currentId}`;
      const batchText = `Партія: ${batchNumber}`;
      
      const serialHeight = doc.heightOfString(serialText, { width: contentWidth });
      const batchHeight = doc.heightOfString(batchText, { width: contentWidth });

      // Dock footer info perfectly above bottom margins
      const serialY = labelHeight - margins.bottom - serialHeight;
      const batchY = serialY - batchHeight - 0.5;

      
      doc.font('Arial-Bold').text(serialText, margins.left, serialY, { width: contentWidth, align: 'center' });
      doc.font('Arial-Bold').text(batchText, margins.left, batchY, { width: contentWidth, align: 'center',  });

      // 4. --- Dynamic Barcode Sizing (Fills everything left in the middle) ---
      const barcodeTopBoundary = manufacturerY + manufacturerHeight + 1.5;
      const barcodeBottomBoundary = batchY - 1.5;
      
      // Dynamic height scales up perfectly to fill the center space
      const availableBarcodeHeight = barcodeBottomBoundary - barcodeTopBoundary;

      const barcodeBuffer = await bwipjs.toBuffer({
        bcid: 'code128',       
        text: currentId,       
        scale: 2.0, // Scale up for crisper barcodes with higher font text             
        height: availableBarcodeHeight,             
        includetext: false,    
      });

      // Keep barcode horizontal sizing safely within label limits
      const barcodeRenderWidth = contentWidth - 4; 
      const barcodeX = margins.left + (contentWidth - barcodeRenderWidth) / 2;

      doc.image(barcodeBuffer, barcodeX, barcodeTopBoundary, { 
        width: barcodeRenderWidth,
        height: availableBarcodeHeight 
      });
    }
    
    doc.end();

    // 2. Generate Batch QR Code
    const qrContent = barcodeList.join(' ');
    await QRCode.toFile(qrPath, qrContent, {
      errorCorrectionLevel: 'M',
      type: 'jpeg',
      width: 600, 
      rendererOpts: { quality: 0.95 }
    });

    return { success: true, pdfPath, qrPath };
  } catch (error) {
    console.error(error);
    return { success: false, error: error.message };
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
