/**
 * Vera Auto Documenter
 * Automatically parses and documents working code
 * Target: 50+ documented tools, auto-generated from source
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, basename } from 'path';
import { logger } from '../monitoring/logger.js';

interface DocumentedFunction {
  name: string;
  description: string;
  params: Array<{ name: string; type: string; description: string }>;
  returns: { type: string; description: string };
  examples: string[];
  filePath: string;
  lineNumber: number;
}

interface ToolDocumentation {
  toolName: string;
  category: string;
  description: string;
  functions: DocumentedFunction[];
  examples: string[];
  testCases: string[];
  relatedTools: string[];
}

export class AutoDocumenter {
  private documentedTools: Map<string, ToolDocumentation> = new Map();
  private stats = {
    filesParsed: 0,
    functionsFound: 0,
    docsGenerated: 0,
    coverage: 0
  };

  /**
   * Parse a source file and extract documentation
   */
  parseFile(filePath: string): DocumentedFunction[] {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const functions: DocumentedFunction[] = [];

    let currentFunction: Partial<DocumentedFunction> | null = null;
    let commentBlock: string[] = [];
    let lineNumber = 0;

    for (const line of lines) {
      lineNumber++;

      // Capture JSDoc comments
      if (line.trim().startsWith('/**') || line.trim().startsWith('* ')) {
        commentBlock.push(line.trim());
        continue;
      }

      // End of comment block - look for function
      if (commentBlock.length > 0 && (line.includes('function') || line.includes('=>') || line.includes('async'))) {
        const funcMatch = line.match(/(?:async\s+)?(?:function\s+)?(\w+)\s*[\(=:]/);
        
        if (funcMatch) {
          currentFunction = {
            name: funcMatch[1],
            description: this.extractDescription(commentBlock),
            params: this.extractParams(commentBlock, line),
            returns: this.extractReturns(commentBlock),
            filePath,
            lineNumber,
            examples: this.extractExamples(commentBlock)
          };

          functions.push(currentFunction as DocumentedFunction);
        }

        commentBlock = [];
        currentFunction = null;
      }
    }

    this.stats.filesParsed++;
    this.stats.functionsFound += functions.length;

    return functions;
  }

  /**
   * Extract description from JSDoc
   */
  private extractDescription(comments: string[]): string {
    for (const comment of comments) {
      const clean = comment.replace(/^\s*\*\s?/, '').trim();
      if (clean && !clean.startsWith('@') && !clean.startsWith('/')) {
        return clean;
      }
    }
    return 'No description available';
  }

  /**
   * Extract params from JSDoc
   */
  private extractParams(comments: string[], functionLine: string): Array<{ name: string; type: string; description: string }> {
    const params: Array<{ name: string; type: string; description: string }> = [];

    // Parse @param tags
    for (const comment of comments) {
      const paramMatch = comment.match(/@param\s+\{?([^}\s]+)\}?\s+(\w+)\s*-?\s*(.*)?/);
      if (paramMatch) {
        params.push({
          type: paramMatch[1],
          name: paramMatch[2],
          description: paramMatch[3] || ''
        });
      }
    }

    // Fallback: extract from function signature
    if (params.length === 0) {
      const sigMatch = functionLine.match(/\(([^)]*)\)/);
      if (sigMatch) {
        const paramNames = sigMatch[1].split(',').map(p => p.trim().split(':')[0].trim()).filter(p => p);
        paramNames.forEach(name => {
          params.push({ name, type: 'any', description: '' });
        });
      }
    }

    return params;
  }
  /**
   * Extract return type from JSDoc
   */
  private extractReturns(comments: string[]): { type: string; description: string } {
    for (const comment of comments) {
      const returnMatch = comment.match(/@returns?\s+\{?([^}\s]+)\}?\s*(.*)?/);
      if (returnMatch) {
        return {
          type: returnMatch[1],
          description: returnMatch[2] || ''
        };
      }
    }
    return { type: 'void', description: '' };
  }

  /**
   * Extract examples from JSDoc
   */
  private extractExamples(comments: string[]): string[] {
    const examples: string[] = [];
    let inExample = false;
    let currentExample = '';

    for (const comment of comments) {
      if (comment.includes('@example')) {
        inExample = true;
        currentExample = '';
        continue;
      }

      if (inExample) {
        if (comment.trim().startsWith('*') && !comment.includes('@')) {
          currentExample += comment.replace(/^\s*\*\s?/, '') + '\n';
        } else {
          if (currentExample.trim()) {
            examples.push(currentExample.trim());
          }
          inExample = false;
        }
      }
    }

    if (inExample && currentExample.trim()) {
      examples.push(currentExample.trim());
    }

    return examples;
  }

  /**
   * Scan directory for source files
   */
  scanDirectory(dir: string, pattern: RegExp = /\.(ts|js|mjs)$/): string[] {
    const files: string[] = [];

    try {
      const entries = readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory() && !entry.name.includes('node_modules')) {
          files.push(...this.scanDirectory(fullPath, pattern));
        } else if (entry.isFile() && pattern.test(entry.name)) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      logger.warn(`Cannot read directory: ${dir}`);
    }

    return files;
  }

  /**
   * Document all tools in a directory
   */
  async documentTools(sourceDir: string, outputDir: string): Promise<void> {
    const files = this.scanDirectory(sourceDir);
    logger.info(`Found ${files.length} source files to document`);

    for (const file of files) {
      try {
        const functions = this.parseFile(file);
        
        if (functions.length > 0) {
          const toolName = basename(file, '.ts').replace(/\.(js|mjs)$/, '');
          const category = this.categorizeTool(file);

          const docs: ToolDocumentation = {
            toolName,
            category,
            description: this.extractFileDescription(file),
            functions,
            examples: this.generateExamples(functions),
            testCases: [],
            relatedTools: []
          };

          this.documentedTools.set(toolName, docs);
          this.stats.docsGenerated++;

          // Write individual doc file
          this.writeToolDoc(docs, outputDir);
        }
      } catch (error) {
        logger.error(`Failed to document ${file}:`, error);
      }
    }

    // Write index
    this.writeIndex(outputDir);

    // Update stats
    this.stats.coverage = Math.round((this.stats.docsGenerated / files.length) * 100);

    logger.info(`Documentation complete: ${this.stats.docsGenerated} tools documented`);
  }

  /**
   * Categorize tool by file path
   */
  private categorizeTool(filePath: string): string {
    if (filePath.includes('carbon')) return 'Carbon';
    if (filePath.includes('hedera')) return 'Hedera';
    if (filePath.includes('ai') || filePath.includes('agent')) return 'AI';
    if (filePath.includes('cache')) return 'Cache';
    if (filePath.includes('monitoring')) return 'Monitoring';
    return 'General';
  }

  /**
   * Extract file-level description
   */
  private extractFileDescription(filePath: string): string {
    try {
      const content = readFileSync(filePath, 'utf8');
      const firstComment = content.match(/\/\*\*\s*\n\s*\*\s*(.+?)\n/);
      return firstComment ? firstComment[1].trim() : 'Tool for Hedera operations';
    } catch {
      return 'Tool for Hedera operations';
    }
  }

  /**
   * Generate usage examples from functions
   */
  private generateExamples(functions: DocumentedFunction[]): string[] {
    const examples: string[] = [];

    for (const func of functions.slice(0, 2)) { // Top 2 functions
      const params = func.params.map(p => `${p.name}: ${p.type}`).join(', ');
      examples.push(`// ${func.description}\n${func.name}(${params});`);
    }

    return examples;
  }

  /**
   * Write individual tool documentation
   */
  private async writeToolDoc(docs: ToolDocumentation, outputDir: string): Promise<void> {
    const fileName = `${docs.toolName}.md`;
    const filePath = join(outputDir, 'auto-docs', docs.category.toLowerCase(), fileName);

    // Ensure directory exists
    const dir = dirname(filePath);
    try {
      const { mkdirSync } = await import('fs');
      mkdirSync(dir, { recursive: true });
    } catch {
      // Directory may already exist
    }

    const content = `# ${docs.toolName}

**Category:** ${docs.category}
**Auto-generated:** ${new Date().toISOString()}

## Description
${docs.description}

## Functions

${docs.functions.map(f => `### ${f.name}

${f.description}

**Parameters:**
${f.params.map(p => `- \`${p.name}\` (${p.type}): ${p.description}`).join('\n') || 'None'}

**Returns:**
- Type: \`${f.returns.type}\`
${f.returns.description ? `- ${f.returns.description}` : ''}

**Examples:**
\`\`\`typescript
${f.examples.join('\n') || '// No examples available'}
\`\`\`

**Location:** \`${f.filePath}:${f.lineNumber}\`
`).join('\n')}

## Quick Usage

\`\`\`typescript
${docs.examples.join('\n\n')}
\`\`\`

---
*Generated by Vera Auto Documenter*
`;

    writeFileSync(filePath, content);
    logger.info(`Generated: ${filePath}`);
  }

  /**
   * Write index of all documented tools
   */
  private writeIndex(outputDir: string): void {
    const tools = Array.from(this.documentedTools.values());
    
    // Group by category
    const byCategory = new Map<string, ToolDocumentation[]>();
    for (const tool of tools) {
      if (!byCategory.has(tool.category)) {
        byCategory.set(tool.category, []);
      }
      byCategory.get(tool.category)!.push(tool);
    }

    const content = `# Vera Auto-Generated Documentation Index

**Total Tools:** ${tools.length}
**Generated:** ${new Date().toISOString()}

## By Category

${Array.from(byCategory).map(([cat, tools]) => `### ${cat} (${tools.length} tools)
${tools.map(t => `- [${t.toolName}](auto-docs/${cat.toLowerCase()}/${t.toolName}.md) - ${t.description.substring(0, 60)}...`).join('\n')}
`).join('\n')}

## Quick Search

| Tool | Category | Functions |
|------|----------|-----------|
${tools.map(t => `| ${t.toolName} | ${t.category} | ${t.functions.length} |`).join('\n')}

---
*Last updated: ${new Date().toISOString()}*
`;

    writeFileSync(join(outputDir, 'AUTO-DOCS-INDEX.md'), content);
  }

  /**
   * Get documentation statistics
   */
  getStats() {
    return {
      ...this.stats,
      totalTools: this.documentedTools.size
    };
  }

  /**
   * Find code by query (semantic search)
   */
  findCode(query: string): Array<{ tool: string; function: string; relevance: number }> {
    const results: Array<{ tool: string; function: string; relevance: number }> = [];
    const queryLower = query.toLowerCase();

    for (const [toolName, docs] of this.documentedTools) {
      for (const func of docs.functions) {
        let relevance = 0;

        // Name match
        if (func.name.toLowerCase().includes(queryLower)) relevance += 3;
        
        // Description match
        if (func.description.toLowerCase().includes(queryLower)) relevance += 2;
        
        // Category match
        if (docs.category.toLowerCase().includes(queryLower)) relevance += 1;

        if (relevance > 0) {
          results.push({
            tool: toolName,
            function: func.name,
            relevance
          });
        }
      }
    }

    // Sort by relevance
    results.sort((a, b) => b.relevance - a.relevance);

    return results.slice(0, 10); // Top 10
  }
}

// Singleton
export const autoDocumenter = new AutoDocumenter();
