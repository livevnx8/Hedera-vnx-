import fs from 'fs/promises';
import path from 'path';
import { createGzip } from 'zlib';
import { promisify } from 'util';
import { pipeline } from 'stream';
import { createReadStream, createWriteStream } from 'fs';

const pipe = promisify(pipeline);

/**
 * Log Rotation System
 * 
 * Manages log files with automatic rotation, compression, and cleanup:
 * - Rotates logs daily or when size exceeds limit
 * - Compresses logs older than 7 days
 * - Deletes logs older than 30 days
 * - Size limit: 10MB per file
 */

export class LogRotator {
  constructor(logsDir = './logs', options = {}) {
    this.logsDir = logsDir;
    this.maxSize = options.maxSize || 10 * 1024 * 1024; // 10MB
    this.maxAge = options.maxAge || 30; // days
    this.compressAfter = options.compressAfter || 7; // days
    this.rotationCheckInterval = options.checkInterval || 60 * 60 * 1000; // 1 hour
    this.timer = null;
  }

  /**
   * Start automatic log rotation
   */
  start() {
    console.log('🔄 Log rotation started');
    this.performRotation(); // Run immediately
    this.timer = setInterval(() => this.performRotation(), this.rotationCheckInterval);
  }

  /**
   * Stop log rotation
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('⏹️ Log rotation stopped');
    }
  }

  /**
   * Perform rotation: check size, rotate if needed, compress old, delete very old
   */
  async performRotation() {
    try {
      const files = await fs.readdir(this.logsDir);
      const logFiles = files.filter(f => f.endsWith('.log'));

      for (const file of logFiles) {
        const filePath = path.join(this.logsDir, file);
        const stats = await fs.stat(filePath);

        // Check if file exceeds size limit
        if (stats.size > this.maxSize) {
          await this.rotateFile(file);
        }
      }

      // Compress old logs
      await this.compressOldLogs();

      // Delete very old logs
      await this.deleteAncientLogs();

      console.log(`✅ Log rotation complete. Checked ${logFiles.length} files.`);
    } catch (error) {
      console.error('❌ Log rotation failed:', error.message);
    }
  }

  /**
   * Rotate a log file (rename with timestamp)
   */
  async rotateFile(filename) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = filename.replace('.log', '');
    const newName = `${baseName}-${timestamp}.log`;
    
    const oldPath = path.join(this.logsDir, filename);
    const newPath = path.join(this.logsDir, newName);

    try {
      await fs.rename(oldPath, newPath);
      console.log(`📝 Rotated ${filename} → ${newName}`);
      
      // Create fresh empty log file
      await fs.writeFile(oldPath, '');
      
      return newPath;
    } catch (error) {
      console.error(`❌ Failed to rotate ${filename}:`, error.message);
      throw error;
    }
  }

  /**
   * Compress logs older than compressAfter days
   */
  async compressOldLogs() {
    const files = await fs.readdir(this.logsDir);
    const logFiles = files.filter(f => f.endsWith('.log') && !f.endsWith('.gz'));
    const now = Date.now();

    for (const file of logFiles) {
      const filePath = path.join(this.logsDir, file);
      const stats = await fs.stat(filePath);
      const ageDays = (now - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);

      if (ageDays > this.compressAfter) {
        await this.compressFile(file);
      }
    }
  }

  /**
   * Compress a single file using gzip
   */
  async compressFile(filename) {
    const inputPath = path.join(this.logsDir, filename);
    const outputPath = `${inputPath}.gz`;

    try {
      const gzip = createGzip();
      const source = createReadStream(inputPath);
      const destination = createWriteStream(outputPath);

      await pipe(source, gzip, destination);
      await fs.unlink(inputPath);
      
      console.log(`🗜️  Compressed ${filename}`);
    } catch (error) {
      console.error(`❌ Failed to compress ${filename}:`, error.message);
    }
  }

  /**
   * Delete logs older than maxAge days
   */
  async deleteAncientLogs() {
    const files = await fs.readdir(this.logsDir);
    const logFiles = files.filter(f => f.endsWith('.log') || f.endsWith('.gz'));
    const now = Date.now();

    for (const file of logFiles) {
      const filePath = path.join(this.logsDir, file);
      const stats = await fs.stat(filePath);
      const ageDays = (now - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);

      if (ageDays > this.maxAge) {
        await fs.unlink(filePath);
        console.log(`🗑️  Deleted old log: ${file}`);
      }
    }
  }

  /**
   * Get log statistics
   */
  async getStats() {
    const files = await fs.readdir(this.logsDir);
    const logFiles = files.filter(f => f.endsWith('.log') || f.endsWith('.gz'));
    
    let totalSize = 0;
    const fileStats = [];

    for (const file of logFiles) {
      const filePath = path.join(this.logsDir, file);
      const stats = await fs.stat(filePath);
      totalSize += stats.size;
      fileStats.push({
        name: file,
        size: stats.size,
        sizeMB: (stats.size / 1024 / 1024).toFixed(2),
        modified: stats.mtime
      });
    }

    return {
      totalFiles: logFiles.length,
      totalSize,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
      files: fileStats.sort((a, b) => b.size - a.size)
    };
  }

  /**
   * Force immediate rotation of all logs
   */
  async forceRotateAll() {
    const files = await fs.readdir(this.logsDir);
    const logFiles = files.filter(f => f.endsWith('.log') && !f.includes('-'));

    for (const file of logFiles) {
      await this.rotateFile(file);
    }

    console.log(`🔄 Force rotated ${logFiles.length} log files`);
  }
}

// Singleton instance
let rotatorInstance = null;

export function getLogRotator(logsDir, options) {
  if (!rotatorInstance) {
    rotatorInstance = new LogRotator(logsDir, options);
  }
  return rotatorInstance;
}

export function resetLogRotator() {
  if (rotatorInstance) {
    rotatorInstance.stop();
    rotatorInstance = null;
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const rotator = new LogRotator('./logs');
  
  const command = process.argv[2];
  
  if (command === 'rotate') {
    rotator.performRotation().then(() => process.exit(0));
  } else if (command === 'stats') {
    rotator.getStats().then(stats => {
      console.log('\n📊 Log Statistics:');
      console.log(`Total files: ${stats.totalFiles}`);
      console.log(`Total size: ${stats.totalSizeMB} MB`);
      console.log('\nLargest files:');
      stats.files.slice(0, 10).forEach(f => {
        console.log(`  ${f.name}: ${f.sizeMB} MB`);
      });
      process.exit(0);
    });
  } else if (command === 'force') {
    rotator.forceRotateAll().then(() => process.exit(0));
  } else {
    console.log('Usage: node logRotation.mjs [rotate|stats|force]');
    process.exit(1);
  }
}
