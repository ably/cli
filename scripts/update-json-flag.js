#!/usr/bin/env node

/**
 * Script to update commands to use the new global --json flag
 * and remove the --format json option.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the list of source files
const walkSync = (dir, filelist = []) => {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      filelist = walkSync(filePath, filelist);
    } else if (filePath.endsWith('.ts')) {
      filelist.push(filePath);
    }
  });
  
  return filelist;
};

const removeFormatFlag = (content) => {
  // Remove the format flag definition
  content = content.replace(/'format':\s*Flags\.string\(\{\s*description:.*?options:.*?default:.*?\}\),/gs, '');
  
  // Update examples - replace --format json with --json
  content = content.replace(/--format json/g, '--json');
  
  // Replace if (flags.format === 'json') with if (this.shouldOutputJson(flags))
  content = content.replace(/if\s*\(\s*flags\.format\s*===\s*['"]json['"]\s*\)/g, 'if (this.shouldOutputJson(flags))');
  
  return content;
};

const updateFiles = async () => {
  const srcPath = path.join(__dirname, '..', 'src');
  const files = walkSync(srcPath);
  
  console.log(`Found ${files.length} TypeScript files to check`);
  
  let updatedCount = 0;
  
  for (const file of files) {
    let content = await fs.promises.readFile(file, 'utf8');
    
    if (content.includes('\'format\': Flags.string') || 
        content.includes('--format json') || 
        content.includes('flags.format ===')) {
      
      const originalContent = content;
      content = removeFormatFlag(content);
      
      if (content !== originalContent) {
        await fs.promises.writeFile(file, content, 'utf8');
        console.log(`Updated ${path.relative(process.cwd(), file)}`);
        updatedCount++;
      }
    }
  }
  
  console.log(`Updated ${updatedCount} files`);
};

updateFiles().catch(error => {
  console.error('Error updating files:', error);
  process.exit(1);
}); 