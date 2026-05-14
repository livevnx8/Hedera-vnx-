/**
 * Hedera File Service (HFS) Tools
 * 
 * Tools for creating, reading, updating, and deleting files on Hedera.
 * HFS provides decentralized file storage with consensus timestamps.
 */

import { 
  Client,
  FileId,
  FileCreateTransaction,
  FileAppendTransaction,
  FileUpdateTransaction,
  FileDeleteTransaction,
  FileContentsQuery,
  FileInfoQuery,
  Hbar,
  KeyList,
  PublicKey,
} from '@hashgraph/sdk';
import { logger } from '../monitoring/logger.js';

export interface FileInfo {
  fileId: string;
  size: number;
  expirationTime: Date | null;
  deleted: boolean;
  keys: string[];
  memo: string;
}

/**
 * Create a new file on Hedera File Service
 */
export async function createFile(
  client: Client,
  options: {
    content: string | Buffer;
    memo?: string;
    expirationDays?: number;
    keys?: PublicKey[];
  }
): Promise<{ success: boolean; fileId?: string; txId?: string; error?: string }> {
  try {
    const content = Buffer.isBuffer(options.content) 
      ? options.content 
      : Buffer.from(options.content, 'utf-8');

    let transaction = new FileCreateTransaction()
      .setContents(content);

    if (options.memo) {
      transaction = transaction.setFileMemo(options.memo);
    }

    if (options.expirationDays) {
      const expiration = new Date();
      expiration.setDate(expiration.getDate() + options.expirationDays);
      transaction = transaction.setExpirationTime(expiration);
    }

    if (options.keys && options.keys.length > 0) {
      const keyList = new KeyList();
      for (const key of options.keys) {
        keyList.push(key);
      }
      transaction = transaction.setKeys(keyList);
    }

    transaction = transaction.freezeWith(client);
    const response = await transaction.execute(client);
    const receipt = await response.getReceipt(client);

    const fileId = receipt.fileId?.toString();

    logger.info('FileService', { 
      message: 'File created', 
      fileId,
      size: content.length,
      txId: response.transactionId?.toString() 
    });

    return {
      success: true,
      fileId,
      txId: response.transactionId?.toString(),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('FileService', { message: 'Failed to create file', error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Append content to an existing file
 */
export async function appendFile(
  client: Client,
  fileId: string,
  content: string | Buffer
): Promise<{ success: boolean; txId?: string; error?: string }> {
  try {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');

    const transaction = new FileAppendTransaction()
      .setFileId(FileId.fromString(fileId))
      .setContents(buffer)
      .freezeWith(client);

    const response = await transaction.execute(client);
    await response.getReceipt(client);

    logger.info('FileService', { 
      message: 'File appended', 
      fileId,
      appendedSize: buffer.length,
      txId: response.transactionId?.toString() 
    });

    return {
      success: true,
      txId: response.transactionId?.toString(),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('FileService', { message: 'Failed to append file', fileId, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Get file contents
 */
export async function getFileContents(
  client: Client,
  fileId: string
): Promise<{ success: boolean; content?: Uint8Array; contentString?: string; error?: string }> {
  try {
    const query = new FileContentsQuery()
      .setFileId(FileId.fromString(fileId));

    const contents = await query.execute(client);

    // Try to decode as UTF-8 string
    let contentString: string | undefined;
    try {
      contentString = Buffer.from(contents).toString('utf-8');
    } catch {
      // Binary content, don't decode
    }

    logger.info('FileService', { 
      message: 'File contents retrieved', 
      fileId,
      size: contents.length 
    });

    return {
      success: true,
      content: contents,
      contentString,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('FileService', { message: 'Failed to get file contents', fileId, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Get file info (metadata)
 */
export async function getFileInfo(
  client: Client,
  fileId: string
): Promise<{ success: boolean; info?: FileInfo; error?: string }> {
  try {
    const query = new FileInfoQuery()
      .setFileId(FileId.fromString(fileId));

    const info = await query.execute(client);

    logger.info('FileService', { 
      message: 'File info retrieved', 
      fileId 
    });

    return {
      success: true,
      info: {
        fileId,
        size: info.size.toNumber(),
        expirationTime: info.expirationTime?.toDate() || null,
        deleted: info.isDeleted,
        keys: [], // SDK doesn't expose key list directly
        memo: info.fileMemo || '',
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('FileService', { message: 'Failed to get file info', fileId, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Update file content and/or keys
 */
export async function updateFile(
  client: Client,
  fileId: string,
  options: {
    content?: string | Buffer;
    keys?: PublicKey[];
    expirationDays?: number;
  }
): Promise<{ success: boolean; txId?: string; error?: string }> {
  try {
    let transaction = new FileUpdateTransaction()
      .setFileId(FileId.fromString(fileId));

    if (options.content) {
      const buffer = Buffer.isBuffer(options.content) 
        ? options.content 
        : Buffer.from(options.content, 'utf-8');
      transaction = transaction.setContents(buffer);
    }

    if (options.keys && options.keys.length > 0) {
      const keyList = new KeyList();
      for (const key of options.keys) {
        keyList.push(key);
      }
      transaction = transaction.setKeys(keyList);
    }

    if (options.expirationDays) {
      const expiration = new Date();
      expiration.setDate(expiration.getDate() + options.expirationDays);
      transaction = transaction.setExpirationTime(expiration);
    }

    transaction = transaction.freezeWith(client);
    const response = await transaction.execute(client);
    await response.getReceipt(client);

    logger.info('FileService', { 
      message: 'File updated', 
      fileId,
      txId: response.transactionId?.toString() 
    });

    return {
      success: true,
      txId: response.transactionId?.toString(),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('FileService', { message: 'Failed to update file', fileId, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Delete a file
 */
export async function deleteFile(
  client: Client,
  fileId: string
): Promise<{ success: boolean; txId?: string; error?: string }> {
  try {
    const transaction = new FileDeleteTransaction()
      .setFileId(FileId.fromString(fileId))
      .freezeWith(client);

    const response = await transaction.execute(client);
    await response.getReceipt(client);

    logger.info('FileService', { 
      message: 'File deleted', 
      fileId,
      txId: response.transactionId?.toString() 
    });

    return {
      success: true,
      txId: response.transactionId?.toString(),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('FileService', { message: 'Failed to delete file', fileId, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Tool definitions for File Service operations
 */
export const fileServiceToolDefinitions = [
  {
    name: 'hfs_create_file',
    description: 'Create a new file on Hedera File Service. Max 1024 bytes initially, can append more later. Returns file ID.',
    parameters: {
      type: 'object',
      properties: {
        content: { 
          type: 'string', 
          description: 'File content (text or base64 encoded binary)' 
        },
        is_base64: {
          type: 'boolean',
          description: 'Whether content is base64 encoded (default false)',
        },
        memo: { 
          type: 'string', 
          description: 'Optional file memo/description' 
        },
        expiration_days: { 
          type: 'number', 
          description: 'Days until file expires (default 90)' 
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'hfs_append_file',
    description: 'Append content to an existing HFS file. Files can be up to several MB through multiple appends.',
    parameters: {
      type: 'object',
      properties: {
        file_id: { 
          type: 'string', 
          description: 'Hedera file ID (0.0.xxx)' 
        },
        content: { 
          type: 'string', 
          description: 'Content to append' 
        },
        is_base64: {
          type: 'boolean',
          description: 'Whether content is base64 encoded (default false)',
        },
      },
      required: ['file_id', 'content'],
    },
  },
  {
    name: 'hfs_get_file',
    description: 'Retrieve file contents from Hedera File Service. Returns content as string or base64 if binary.',
    parameters: {
      type: 'object',
      properties: {
        file_id: { 
          type: 'string', 
          description: 'File ID to retrieve' 
        },
      },
      required: ['file_id'],
    },
  },
  {
    name: 'hfs_get_file_info',
    description: 'Get file metadata: size, expiration, keys, memo. Does not return content.',
    parameters: {
      type: 'object',
      properties: {
        file_id: { 
          type: 'string', 
          description: 'File ID to query' 
        },
      },
      required: ['file_id'],
    },
  },
  {
    name: 'hfs_update_file',
    description: 'Update file content, keys, or expiration. Requires file admin key.',
    parameters: {
      type: 'object',
      properties: {
        file_id: { 
          type: 'string', 
          description: 'File ID to update' 
        },
        content: { 
          type: 'string', 
          description: 'New file content' 
        },
        is_base64: {
          type: 'boolean',
          description: 'Whether content is base64 encoded',
        },
        expiration_days: { 
          type: 'number', 
          description: 'New expiration in days from now' 
        },
      },
      required: ['file_id'],
    },
  },
  {
    name: 'hfs_delete_file',
    description: 'Delete a file from HFS. Requires file admin key. File is marked deleted but remains on chain.',
    parameters: {
      type: 'object',
      properties: {
        file_id: { 
          type: 'string', 
          description: 'File ID to delete' 
        },
      },
      required: ['file_id'],
    },
  },
];

/**
 * Execute File Service tool
 */
export async function executeFileServiceTool(
  client: Client,
  tool: string,
  args: any
): Promise<{ success: boolean; result?: any; error?: string }> {
  switch (tool) {
    case 'hfs_create_file': {
      const content = args.is_base64 
        ? Buffer.from(args.content, 'base64')
        : args.content;
      const result = await createFile(client, {
        content,
        memo: args.memo,
        expirationDays: args.expiration_days || 90,
      });
      return result.success 
        ? { success: true, result: { file_id: result.fileId, tx_id: result.txId } }
        : { success: false, error: result.error };
    }

    case 'hfs_append_file': {
      const content = args.is_base64 
        ? Buffer.from(args.content, 'base64')
        : args.content;
      const result = await appendFile(client, args.file_id, content);
      return result.success 
        ? { success: true, result: { tx_id: result.txId } }
        : { success: false, error: result.error };
    }

    case 'hfs_get_file': {
      const result = await getFileContents(client, args.file_id);
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return { 
        success: true, 
        result: { 
          content: result.contentString || Buffer.from(result.content || []).toString('base64'),
          is_binary: !result.contentString,
          size: result.content?.length 
        } 
      };
    }

    case 'hfs_get_file_info': {
      const result = await getFileInfo(client, args.file_id);
      return result.success 
        ? { success: true, result: result.info }
        : { success: false, error: result.error };
    }

    case 'hfs_update_file': {
      const content = args.is_base64 
        ? Buffer.from(args.content, 'base64')
        : args.content;
      const result = await updateFile(client, args.file_id, {
        content,
        expirationDays: args.expiration_days,
      });
      return result.success 
        ? { success: true, result: { tx_id: result.txId } }
        : { success: false, error: result.error };
    }

    case 'hfs_delete_file': {
      const result = await deleteFile(client, args.file_id);
      return result.success 
        ? { success: true, result: { tx_id: result.txId } }
        : { success: false, error: result.error };
    }

    default:
      return { success: false, error: `Unknown file service tool: ${tool}` };
  }
}
