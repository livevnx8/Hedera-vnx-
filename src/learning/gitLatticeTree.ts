import { readdir, readFile, stat } from 'fs/promises';
import path from 'path';
import { config } from '../config.js';

type GitLatticeNodeType =
  | 'repo'
  | 'package'
  | 'surface'
  | 'capability'
  | 'workflow'
  | 'block_stream_evidence'
  | 'proof'
  | 'lesson'
  | 'upgrade_package';

type GitLatticeEdgeType =
  | 'implements'
  | 'verified_by'
  | 'depends_on'
  | 'emits'
  | 'evidenced_by'
  | 'learned_from'
  | 'promotes_to';

export interface GitLatticeNode {
  id: string;
  type: GitLatticeNodeType;
  label: string;
  path?: string;
  metadata: Record<string, unknown>;
}

export interface GitLatticeEdge {
  id: string;
  type: GitLatticeEdgeType;
  source: string;
  target: string;
  metadata: Record<string, unknown>;
}

export interface GitLatticeScan {
  enabled: boolean;
  mode: 'private' | 'public';
  root: string;
  scannedAt: string;
  nodes: GitLatticeNode[];
  edges: GitLatticeEdge[];
  stats: {
    filesSeen: number;
    filesIndexed: number;
    filesSkipped: number;
    secretFlags: number;
    maxFileKb: number;
  };
  warnings: string[];
}

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  '.turbo',
  '.next',
  '.cache',
  'logs',
]);

const SKIP_FILES = new Set([
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  'data.sqlite',
  'security-audit-report.json',
]);

const INDEX_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.html',
  '.css',
  '.yml',
  '.yaml',
]);

const SECRET_PATTERNS = [
  /private[_-]?key/i,
  /operator[_-]?private/i,
  /api[_-]?key/i,
  /secret/i,
  /mnemonic/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

class GitLatticeTree {
  private lastScan: GitLatticeScan | null = null;

  getStatus(): Omit<GitLatticeScan, 'nodes' | 'edges'> & { nodeCount: number; edgeCount: number } {
    const scan = this.lastScan;
    return {
      enabled: config.VERA_GIT_LATTICE_ENABLED === 'true',
      mode: config.VERA_GIT_LATTICE_MODE,
      root: this.resolveRoot(),
      scannedAt: scan?.scannedAt ?? '',
      stats: scan?.stats ?? {
        filesSeen: 0,
        filesIndexed: 0,
        filesSkipped: 0,
        secretFlags: 0,
        maxFileKb: config.VERA_GIT_LATTICE_MAX_FILE_KB,
      },
      warnings: scan?.warnings ?? [],
      nodeCount: scan?.nodes.length ?? 0,
      edgeCount: scan?.edges.length ?? 0,
    };
  }

  getLastScan(): GitLatticeScan | null {
    return this.lastScan;
  }

  async scan(): Promise<GitLatticeScan> {
    const root = this.resolveRoot();
    const nodes: GitLatticeNode[] = [
      {
        id: 'repo:local',
        type: 'repo',
        label: path.basename(root) || 'local-repo',
        path: '.',
        metadata: {
          private: config.VERA_GIT_LATTICE_MODE === 'private',
          source: 'local-workspace',
        },
      },
    ];
    const edges: GitLatticeEdge[] = [];
    const warnings: string[] = [];
    const stats = {
      filesSeen: 0,
      filesIndexed: 0,
      filesSkipped: 0,
      secretFlags: 0,
      maxFileKb: config.VERA_GIT_LATTICE_MAX_FILE_KB,
    };

    const files = await this.walk(root, root, stats, warnings);

    for (const file of files) {
      const absolute = path.join(root, file);
      const fileStat = await stat(absolute);
      const sizeKb = Math.ceil(fileStat.size / 1024);
      if (sizeKb > config.VERA_GIT_LATTICE_MAX_FILE_KB) {
        stats.filesSkipped++;
        continue;
      }

      const text = await readFile(absolute, 'utf8').catch(() => '');
      const secretFlags = this.countSecretFlags(file, text);
      stats.secretFlags += secretFlags;

      if (config.VERA_GIT_LATTICE_SECRET_SCAN_REQUIRED === 'true' && secretFlags > 0) {
        stats.filesSkipped++;
        warnings.push(`Skipped ${file}: potential secret-bearing content`);
        continue;
      }

      const node = this.fileToNode(file, text, sizeKb);
      nodes.push(node);
      edges.push({
        id: `edge:repo:local:${node.id}`,
        type: 'implements',
        source: 'repo:local',
        target: node.id,
        metadata: { relationship: 'contains' },
      });

      for (const proof of this.extractProofNodes(file, text)) {
        nodes.push(proof);
        edges.push({
          id: `edge:${node.id}:${proof.id}`,
          type: 'verified_by',
          source: node.id,
          target: proof.id,
          metadata: { relationship: 'local proof surface' },
        });
      }

      stats.filesIndexed++;
    }

    this.lastScan = {
      enabled: config.VERA_GIT_LATTICE_ENABLED === 'true',
      mode: config.VERA_GIT_LATTICE_MODE,
      root,
      scannedAt: new Date().toISOString(),
      nodes,
      edges,
      stats,
      warnings: warnings.slice(0, 50),
    };

    return this.lastScan;
  }

  private resolveRoot(): string {
    const configured = config.VERA_GIT_LATTICE_ROOT || './';
    return path.resolve(process.cwd(), configured);
  }

  private async walk(root: string, dir: string, stats: GitLatticeScan['stats'], warnings: string[]): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true }).catch((error) => {
      warnings.push(`Could not read ${path.relative(root, dir) || '.'}: ${String(error)}`);
      return [];
    });
    const files: string[] = [];

    for (const entry of entries) {
      const absolute = path.join(dir, entry.name);
      const relative = path.relative(root, absolute);

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        files.push(...await this.walk(root, absolute, stats, warnings));
        continue;
      }

      if (!entry.isFile()) continue;
      stats.filesSeen++;
      if (SKIP_FILES.has(entry.name) || !INDEX_EXTENSIONS.has(path.extname(entry.name))) {
        stats.filesSkipped++;
        continue;
      }
      files.push(relative);
    }

    return files;
  }

  private fileToNode(file: string, text: string, sizeKb: number): GitLatticeNode {
    const type = this.classifyFile(file);
    return {
      id: `${type}:${file}`,
      type,
      label: path.basename(file),
      path: file,
      metadata: {
        directory: path.dirname(file),
        extension: path.extname(file),
        sizeKb,
        symbols: this.extractSymbols(text).slice(0, 25),
        concepts: this.extractConcepts(file, text).slice(0, 12),
      },
    };
  }

  private classifyFile(file: string): GitLatticeNodeType {
    if (/\.(test|spec)\.(ts|tsx|js|mjs)$/.test(file) || file.includes('/tests/')) return 'proof';
    if (file.includes('/workflows/')) return 'workflow';
    if (/hip[-_]?1056|block[-_ ]stream/i.test(file)) return 'block_stream_evidence';
    if (file.startsWith('public/') || file.includes('/routes/') || file.endsWith('.html')) return 'surface';
    if (file.includes('/marketplace/') || file.includes('/hedera/') || file.includes('/vera/') || file.includes('/lattice/')) return 'capability';
    if (file === 'package.json' || file.endsWith('/package.json') || file.includes('/config/')) return 'package';
    if (file.endsWith('.md')) return 'lesson';
    return 'capability';
  }

  private extractProofNodes(file: string, text: string): GitLatticeNode[] {
    if (!file.includes('/routes/') && !file.startsWith('public/') && !file.includes('/orchestrator/') && !file.includes('/workflows/')) return [];
    const proofs: GitLatticeNode[] = [];
    const mentionsTests = /test|vitest|describe\(|it\(/i.test(text);
    const mentionsHcs = /HCS|TopicMessage|HashScan|receipt|proof/i.test(text);

    if (mentionsTests) {
      proofs.push({
        id: `proof:test-surface:${file}`,
        type: 'proof',
        label: `Test surface for ${path.basename(file)}`,
        metadata: { kind: 'test-reference', sourcePath: file },
      });
    }
    if (mentionsHcs) {
      proofs.push({
        id: `proof:hcs-surface:${file}`,
        type: 'proof',
        label: `HCS/proof surface for ${path.basename(file)}`,
        metadata: { kind: 'receipt-reference', sourcePath: file },
      });
    }
    if (/HIP-1056|block stream|block-stream|BlockProof|BlockHeader/i.test(text)) {
      proofs.push({
        id: `proof:block-stream:${file}`,
        type: 'block_stream_evidence',
        label: `HIP-1056 evidence surface for ${path.basename(file)}`,
        metadata: { kind: 'block-stream-reference', sourcePath: file },
      });
    }

    return proofs;
  }

  private extractSymbols(text: string): string[] {
    const symbols = new Set<string>();
    const patterns = [
      /export\s+(?:class|function|const|interface|type)\s+([A-Za-z0-9_]+)/g,
      /(?:class|function|interface|type)\s+([A-Za-z0-9_]+)/g,
      /app\.(get|post|put|delete)\(['"`]([^'"`]+)/g,
    ];

    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        symbols.add(match[2] || match[1]);
      }
    }

    return Array.from(symbols);
  }

  private extractConcepts(file: string, text: string): string[] {
    const haystack = `${file}\n${text.slice(0, 4000)}`.toLowerCase();
    const concepts: Array<[RegExp, string]> = [
      [/hedera|hbar|hts|hcs|hashscan/, 'hedera'],
      [/wallet|hashpack|hashconnect/, 'wallet-auth'],
      [/settlement|payment|x402|treasury/, 'settlement'],
      [/agent|marketplace|registration|bid/, 'agent-marketplace'],
      [/lattice|harmony|scheduler|rig/, 'harmony-lattice'],
      [/workflow|ellipse|elliptical|proof loop/, 'elliptical-workflow'],
      [/hip-?1056|block stream|block proof|blockheader|blockproof/, 'hip1056-block-stream'],
      [/deepseek|high-parameter|model synthesis|learning packet|amplification/, 'model-amplified-learning'],
      [/qdrant|memory|knowledge|learning/, 'learning-memory'],
      [/test|vitest|proof|receipt/, 'proof-quality'],
      [/dashboard|html|public|ui/, 'operator-ui'],
    ];
    return concepts.flatMap(([regex, concept]) => regex.test(haystack) ? [concept] : []);
  }

  private countSecretFlags(file: string, text: string): number {
    if (file.includes('.env')) return 1;
    return SECRET_PATTERNS.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
  }
}

export const gitLatticeTree = new GitLatticeTree();
