import chalk from 'chalk'

/**
 * Display the Ably logo with a gradient color
 * @param log Function to use for logging each line
 * @param startColor The starting color of the gradient (bottom-left)
 * @param endColor The ending color of the gradient (top-right)
 */
export function displayLogo(
  log: (message: string) => void,
  startColor = { r: 0xFF, g: 0xb0, b: 0x96 }, // #FFB096 (orange)
  endColor = { r: 0xFF, g: 0x0D, b: 0x03 }    // #FF0D03 (red)
): void {
  // ASCII art for Ably logo
  const logo = [
    ' ______  __       ___',
    '/\\  _  \\/\\ \\     /\\_ \\',
    '\\ \\ \\L\\ \\ \\ \\____\\//\\ \\    __  __',
    ' \\ \\  __ \\ \\ \'__`\\ \\ \\ \\  /\\ \\/\\ \\',
    '  \\ \\ \\/\\ \\ \\ \\L\\ \\ \\_\\ \\_\\ \\ \\_\\ \\',
    '   \\ \\_\\ \\_\\ \\_,__/ /\\____\\\\/`____ \\',
    '    \\/_/\\/_/\\/___/  \\/____/ `/___/> \\',
    '                               /\\___/',
    '                               \\/__/'
  ];
  
  // Calculate logo dimensions
  const logoHeight = logo.length;
  const logoWidth = Math.max(...logo.map(line => line.length));
  
  // Display each line with gradient color
  for (let y = 0; y < logoHeight; y++) {
    const line = logo[y];
    let coloredLine = '';
    
    for (let x = 0; x < line.length; x++) {
      // Skip spaces - they don't need coloring
      if (line[x] === ' ') {
        coloredLine += ' ';
        continue;
      }
      
      // We'll use a simpler gradient calculation
      // Distance from bottom-left (0,0) corner
      const maxDistance = logoWidth + logoHeight - 2;
      
      // Calculate distance from bottom-left corner (logoHeight-1-y, 0)
      // to current position (logoHeight-1-y, x)
      const distance = x + y;
      
      // Create a ratio based on the distance
      const ratio = distance / maxDistance;
      
      // Interpolate between the colors
      const r = Math.round(startColor.r + (endColor.r - startColor.r) * ratio);
      const g = Math.round(startColor.g + (endColor.g - startColor.g) * ratio);
      const b = Math.round(startColor.b + (endColor.b - startColor.b) * ratio);
      
      // Convert to hex for chalk
      const color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      
      // Add the colored character
      coloredLine += chalk.hex(color)(line[x]);
    }
    
    log(coloredLine);
  }

  console.log('\n')
} 