const QRCode = require('qrcode');
const path = require('path');

// ========================================================
// HARDCODED CONFIGURATION VALUES
// ========================================================
const TEXT_TO_ENCODE = "redacted"; // The text or URL you want to encode in the QR code
const OUTPUT_FILENAME = "generated_qr.png"; // Saves as PNG, JPG, or SVG depending on extension
const IMAGE_WIDTH = 600; // Resolution size in pixels (600px is perfect for high-quality printing)

// Error Correction Levels: 'L' (Low), 'M' (Medium), 'Q' (Quartile), 'H' (High)
// 'H' allows the QR code to stay scannable even if the sticker gets scratched or dirty.
const ERROR_CORRECTION = 'H'; 
// ========================================================

async function generateStandaloneQR() {
  try {
    const outputPath = path.join(__dirname, OUTPUT_FILENAME);

    const options = {
      errorCorrectionLevel: ERROR_CORRECTION,
      type: 'png',
      width: IMAGE_WIDTH,
      margin: 2, // The white border thickness around the QR code matrix
      color: {
        dark: '#000000',  // Pure black modules
        light: '#FFFFFF' // Pure white background
      }
    };

    console.log(`🔄 Generating QR Code for: "${TEXT_TO_ENCODE}"...`);
    
    await QRCode.toFile(outputPath, TEXT_TO_ENCODE, options);
    
    console.log(`✅ Success! Your QR code has been saved to:`);
    console.log(`   👉 ${outputPath}`);

  } catch (error) {
    console.error("❌ Failed to generate QR Code:", error.message);
  }
}

// Execute the generation immediately
generateStandaloneQR();