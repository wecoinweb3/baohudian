import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const possibleDataDirs = [
  path.join(__dirname, '../../data'),
  path.join(__dirname, '../data'),
];

export const getDataDir = (): string => {
  const existingDir = possibleDataDirs.find(dir => fs.existsSync(dir));
  if (existingDir) return existingDir;
  
  const targetDir = possibleDataDirs[0];
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  return targetDir;
};

export const getDbPath = (): string => {
  return path.join(getDataDir(), 'design-projects.sqlite');
};

export const getUploadDir = (): string => {
  const uploadDir = process.env.UPLOAD_DIR;
  if (uploadDir && fs.existsSync(uploadDir)) {
    return uploadDir;
  }
  
  const possibleUploadDirs = [
    path.join(__dirname, '../../uploads'),
    path.join(__dirname, '../uploads'),
  ];
  
  const existingDir = possibleUploadDirs.find(dir => fs.existsSync(dir));
  if (existingDir) return existingDir;
  
  const targetDir = possibleUploadDirs[0];
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  return targetDir;
};