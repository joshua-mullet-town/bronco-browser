const { createCanvas } = require('canvas');
const fs = require('fs');

const colors = {
  gray: '#9CA3AF',
  yellow: '#F59E0B',
  green: '#10B981'
};

const sizes = [16, 48, 128];

for (const [colorName, colorHex] of Object.entries(colors)) {
  for (const size of sizes) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Draw circle
    ctx.fillStyle = colorHex;
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2 - 1, 0, Math.PI * 2);
    ctx.fill();

    // Draw "B" letter
    ctx.fillStyle = 'white';
    const fontSize = Math.floor(size * 0.6);
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('B', size/2, size/2 + 1);

    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(`icon-${colorName}-${size}.png`, buffer);
    console.log(`Created icon-${colorName}-${size}.png`);
  }
}
