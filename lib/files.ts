import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export async function saveFileFromBase64(base64Content: string, originalFilename: string): Promise<string> {
  // Extract file extension
  const extension = path.extname(originalFilename);
  
  // Generate unique filename
  const filename = `${uuidv4()}${extension}`;
  const filePath = path.join(UPLOADS_DIR, filename);
  
  // Remove data URL prefix if present
  const base64Data = base64Content.replace(/^data:[^;]+;base64,/, '');
  
  // Write file to disk
  await fs.promises.writeFile(filePath, Buffer.from(base64Data, 'base64'));
  
  // Return relative path for database storage
  return `/uploads/${filename}`;
} 