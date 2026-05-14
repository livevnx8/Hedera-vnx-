#!/usr/bin/env node

/**
 * Security Audit Script
 * 
 * Performs comprehensive security checks on the Vera codebase
 * and generates a detailed security report.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

class SecurityAuditor {
  constructor() {
    this.issues = [];
    this.warnings = [];
    this.recommendations = [];
  }

  async runAudit() {
    console.log('🔍 Starting Vera Security Audit...\n');

    await this.checkEnvironmentSecurity();
    await this.checkCodeSecurity();
    await this.checkDependencies();
    await this.checkFilePermissions();
    await this.checkSecretsExposure();
    await this.checkInputValidation();
    await this.checkAuthentication();
    await this.checkLoggingSecurity();

    this.generateReport();
  }

  async checkEnvironmentSecurity() {
    console.log('🔐 Checking Environment Security...');

    // Check .env file
    const envPath = path.join(projectRoot, '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      
      // Check for exposed private keys
      if (envContent.includes('9cfa3e5df71a208161cde815aa4fe918bc1a3ed0d98c1317b9181b6fc07b5f6b')) {
        this.issues.push('CRITICAL: Exposed Hedera private key in .env file');
      }

      // Check for other sensitive data
      const sensitivePatterns = [
        /PRIVATE_KEY\s*=\s*[a-f0-9]{64}/i,
        /SECRET\s*=\s*[a-zA-Z0-9]{32,}/i,
        /API_KEY\s*=\s*[a-zA-Z0-9]{20,}/i,
        /PASSWORD\s*=\s*\w+/i
      ];

      for (const pattern of sensitivePatterns) {
        if (pattern.test(envContent)) {
          this.issues.push('HIGH: Sensitive data exposed in .env file');
          break;
        }
      }

      // Check if .env is in .gitignore
      const gitignorePath = path.join(projectRoot, '.gitignore');
      if (fs.existsSync(gitignorePath)) {
        const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
        if (!gitignoreContent.includes('.env')) {
          this.issues.push('HIGH: .env file not in .gitignore');
        }
      }
    }

    // Check for secure config usage
    const configFiles = [
      'src/config/secureConfig.ts',
      'src/security/keyManager.ts',
      'src/security/secureLogger.ts'
    ];

    for (const configFile of configFiles) {
      const configPath = path.join(projectRoot, configFile);
      if (!fs.existsSync(configPath)) {
        this.warnings.push(`Secure config file missing: ${configFile}`);
      }
    }

    console.log('✅ Environment Security Check Complete\n');
  }

  async checkCodeSecurity() {
    console.log('🔍 Checking Code Security...');

    const srcDir = path.join(projectRoot, 'src');
    const files = this.getAllFiles(srcDir, ['.ts', '.js']);

    for (const file of files) {
      await this.analyzeFile(file);
    }

    console.log('✅ Code Security Check Complete\n');
  }

  async analyzeFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');

    // Check for console.log in production code
    if (content.includes('console.log') || content.includes('console.warn') || content.includes('console.error')) {
      const relativePath = path.relative(projectRoot, filePath);
      if (!relativePath.includes('test') && !relativePath.includes('spec')) {
        this.warnings.push(`Console logging found in production code: ${relativePath}`);
      }
    }

    // Check for eval usage
    if (content.includes('eval(')) {
      this.issues.push(`CRITICAL: eval() usage detected: ${path.relative(projectRoot, filePath)}`);
    }

    // Check for Function constructor
    if (content.includes('new Function(')) {
      this.issues.push(`HIGH: Function() constructor usage: ${path.relative(projectRoot, filePath)}`);
    }

    // Check for setTimeout with string
    if (content.match(/setTimeout\s*\(\s*['"]/)) {
      this.issues.push(`HIGH: setTimeout with string detected: ${path.relative(projectRoot, filePath)}`);
    }

    // Check for empty catch blocks
    if (content.match(/catch\s*\(\s*\)\s*\{\s*\}/)) {
      this.issues.push(`MEDIUM: Empty catch block detected: ${path.relative(projectRoot, filePath)}`);
    }

    // Check for any types
    if (content.includes(': any') || content.includes('<any>')) {
      this.warnings.push(`Type safety issue: 'any' type usage: ${path.relative(projectRoot, filePath)}`);
    }

    // Check for hardcoded secrets
    const secretPatterns = [
      /['"][a-f0-9]{64}['"]/, // 64-char hex (private key)
      /['"][A-Za-z0-9+/]{40,}={0,2}['"]/, // Base64
      /sk-[a-zA-Z0-9]{48}/, // Stripe key
      /ghp_[a-zA-Z0-9]{36}/, // GitHub token
    ];

    for (const pattern of secretPatterns) {
      if (pattern.test(content)) {
        this.issues.push(`CRITICAL: Hardcoded secret detected: ${path.relative(projectRoot, filePath)}`);
        break;
      }
    }
  }

  async checkDependencies() {
    console.log('📦 Checking Dependencies Security...');

    const packageJsonPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      // Check for known vulnerable packages
      const vulnerablePackages = [
        'lodash < 4.17.21',
        'axios < 0.21.1',
        'node-forge < 1.3.0',
        'request < 2.88.0'
      ];

      for (const vulnerable of vulnerablePackages) {
        const [pkg, version] = vulnerable.split(' < ');
        if (packageJson.dependencies?.[pkg]) {
          this.warnings.push(`Potentially vulnerable dependency: ${pkg}`);
        }
      }

      // Check for outdated packages
      const outdatedPackages = [
        'body-parser',
        'multer',
        'debug'
      ];

      for (const outdated of outdatedPackages) {
        if (packageJson.dependencies?.[outdated]) {
          this.recommendations.push(`Consider updating outdated package: ${outdated}`);
        }
      }
    }

    console.log('✅ Dependencies Security Check Complete\n');
  }

  async checkFilePermissions() {
    console.log('🔒 Checking File Permissions...');

    const sensitiveFiles = [
      '.env',
      '.env.local',
      '.env.production',
      'config/private.json',
      'keys/',
      'certs/'
    ];

    for (const file of sensitiveFiles) {
      const filePath = path.join(projectRoot, file);
      if (fs.existsSync(filePath)) {
        try {
          const stats = fs.statSync(filePath);
          const mode = stats.mode;
          
          // Check if file is readable by others
          if (mode & 0o004) {
            this.issues.push(`HIGH: Sensitive file readable by others: ${file}`);
          }
          
          // Check if file is writable by group
          if (mode & 0o020) {
            this.warnings.push(`File writable by group: ${file}`);
          }
        } catch (error) {
          this.warnings.push(`Could not check permissions for: ${file}`);
        }
      }
    }

    console.log('✅ File Permissions Check Complete\n');
  }

  async checkSecretsExposure() {
    console.log('🔑 Checking for Secrets Exposure...');

    const sensitivePatterns = [
      { pattern: /private[_-]?key/i, description: 'Private key' },
      { pattern: /secret[_-]?key/i, description: 'Secret key' },
      { pattern: /api[_-]?key/i, description: 'API key' },
      { pattern: /password/i, description: 'Password' },
      { pattern: /token/i, description: 'Token' },
      { pattern: /credential/i, description: 'Credential' }
    ];

    const srcDir = path.join(projectRoot, 'src');
    const files = this.getAllFiles(srcDir, ['.ts', '.js', '.json']);

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      
      for (const { pattern, description } of sensitivePatterns) {
        if (pattern.test(content)) {
          const relativePath = path.relative(projectRoot, file);
          
          // Check if it's in a secure context
          if (!relativePath.includes('security') && !relativePath.includes('config')) {
            this.warnings.push(`Potential ${description} exposure: ${relativePath}`);
          }
        }
      }
    }

    console.log('✅ Secrets Exposure Check Complete\n');
  }

  async checkInputValidation() {
    console.log('🛡️ Checking Input Validation...');

    const routeFiles = this.getAllFiles(path.join(projectRoot, 'src/routes'), ['.ts']);
    
    for (const file of routeFiles) {
      const content = fs.readFileSync(file, 'utf8');
      
      // Check for request body validation
      if (content.includes('request.body') && !content.includes('zod') && !content.includes('joi') && !content.includes('validation')) {
        this.warnings.push(`Missing input validation: ${path.relative(projectRoot, file)}`);
      }
      
      // Check for SQL injection risks
      if (content.includes('SELECT') && content.includes('+') && !content.includes('prepare') && !content.includes('escape')) {
        this.issues.push(`Potential SQL injection risk: ${path.relative(projectRoot, file)}`);
      }
    }

    console.log('✅ Input Validation Check Complete\n');
  }

  async checkAuthentication() {
    console.log('🔐 Checking Authentication...');

    const authFiles = [
      'src/auth.ts',
      'src/auth/middleware.ts',
      'src/auth/validation.ts'
    ];

    for (const authFile of authFiles) {
      const filePath = path.join(projectRoot, authFile);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Check for JWT usage
        if (content.includes('jwt') && !content.includes('verify')) {
          this.warnings.push(`JWT verification missing: ${authFile}`);
        }
        
        // Check for session security
        if (content.includes('session') && !content.includes('secure') && !content.includes('httpOnly')) {
          this.warnings.push(`Session security flags missing: ${authFile}`);
        }
      }
    }

    console.log('✅ Authentication Check Complete\n');
  }

  async checkLoggingSecurity() {
    console.log('📝 Checking Logging Security...');

    const logFiles = this.getAllFiles(path.join(projectRoot, 'src'), ['.ts', '.js']);
    
    for (const file of logFiles) {
      const content = fs.readFileSync(file, 'utf8');
      
      // Check for sensitive data in logs
      if (content.includes('console.log') && content.includes('password') || content.includes('secret') || content.includes('key')) {
        this.issues.push(`Sensitive data in logs: ${path.relative(projectRoot, file)}`);
      }
      
      // Check for structured logging
      if (content.includes('console.log') && !content.includes('logger') && !content.includes('winston')) {
        this.recommendations.push(`Use structured logging: ${path.relative(projectRoot, file)}`);
      }
    }

    console.log('✅ Logging Security Check Complete\n');
  }

  getAllFiles(dir, extensions) {
    const files = [];
    
    if (!fs.existsSync(dir)) {
      return files;
    }

    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        files.push(...this.getAllFiles(fullPath, extensions));
      } else if (extensions.some(ext => item.endsWith(ext))) {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  generateReport() {
    console.log('📊 Generating Security Report...\n');

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        critical: this.issues.filter(i => i.includes('CRITICAL')).length,
        high: this.issues.filter(i => i.includes('HIGH')).length,
        medium: this.issues.filter(i => i.includes('MEDIUM')).length,
        low: this.issues.filter(i => i.includes('LOW')).length,
        warnings: this.warnings.length,
        recommendations: this.recommendations.length
      },
      issues: this.issues,
      warnings: this.warnings,
      recommendations: this.recommendations,
      score: this.calculateSecurityScore()
    };

    // Output to console
    console.log('🔒 SECURITY AUDIT REPORT');
    console.log('========================\n');
    
    console.log(`📊 Security Score: ${report.score}/100\n`);
    
    if (report.summary.critical > 0) {
      console.log(`🚨 CRITICAL ISSUES: ${report.summary.critical}`);
      this.issues.filter(i => i.includes('CRITICAL')).forEach(issue => {
        console.log(`   - ${issue}`);
      });
      console.log('');
    }
    
    if (report.summary.high > 0) {
      console.log(`⚠️ HIGH ISSUES: ${report.summary.high}`);
      this.issues.filter(i => i.includes('HIGH')).forEach(issue => {
        console.log(`   - ${issue}`);
      });
      console.log('');
    }
    
    if (report.summary.medium > 0) {
      console.log(`⚡ MEDIUM ISSUES: ${report.summary.medium}`);
      this.issues.filter(i => i.includes('MEDIUM')).forEach(issue => {
        console.log(`   - ${issue}`);
      });
      console.log('');
    }
    
    if (report.summary.warnings > 0) {
      console.log(`⚠️ WARNINGS: ${report.summary.warnings}`);
      this.warnings.slice(0, 10).forEach(warning => {
        console.log(`   - ${warning}`);
      });
      if (this.warnings.length > 10) {
        console.log(`   ... and ${this.warnings.length - 10} more`);
      }
      console.log('');
    }
    
    if (report.summary.recommendations > 0) {
      console.log(`💡 RECOMMENDATIONS: ${report.summary.recommendations}`);
      this.recommendations.slice(0, 5).forEach(rec => {
        console.log(`   - ${rec}`);
      });
      if (this.recommendations.length > 5) {
        console.log(`   ... and ${this.recommendations.length - 5} more`);
      }
      console.log('');
    }

    // Save detailed report
    const reportPath = path.join(projectRoot, 'security-audit-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📄 Detailed report saved to: ${reportPath}`);

    // Exit with appropriate code
    const exitCode = report.summary.critical > 0 ? 1 : report.summary.high > 0 ? 2 : 0;
    process.exit(exitCode);
  }

  calculateSecurityScore() {
    let score = 100;
    
    // Deduct points for issues
    score -= this.issues.filter(i => i.includes('CRITICAL')).length * 25;
    score -= this.issues.filter(i => i.includes('HIGH')).length * 15;
    score -= this.issues.filter(i => i.includes('MEDIUM')).length * 10;
    score -= this.issues.filter(i => i.includes('LOW')).length * 5;
    score -= this.warnings.length * 2;
    score -= this.recommendations.length * 1;
    
    return Math.max(0, score);
  }
}

// Run the audit
const auditor = new SecurityAuditor();
auditor.runAudit().catch(error => {
  console.error('❌ Security audit failed:', error);
  process.exit(1);
});
