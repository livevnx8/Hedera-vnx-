/**
 * Text-to-Speech Engine for Vera Oasis
 * 
 * Provides voice output for hands-free interaction
 * Uses system TTS or espeak as fallback
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

export interface TTSConfig {
  enabled: boolean;
  voice: string;
  rate: number;      // Words per minute
  pitch: number;     // 0-100
  volume: number;    // 0-100
  engine: 'piper' | 'espeak' | 'system';
}

export class TTSEngine {
  private config: TTSConfig;
  private isSpeaking = false;
  private queue: string[] = [];

  constructor(config?: Partial<TTSConfig>) {
    this.config = {
      enabled: true,
      voice: 'en-us',
      rate: 175,
      pitch: 50,
      volume: 80,
      engine: 'espeak',
      ...config,
    };
  }

  /**
   * Speak text using configured TTS engine
   */
  async speak(text: string): Promise<void> {
    if (!this.config.enabled) return;
    
    // Queue if already speaking
    if (this.isSpeaking) {
      this.queue.push(text);
      return;
    }

    this.isSpeaking = true;

    try {
      switch (this.config.engine) {
        case 'piper':
          await this.speakPiper(text);
          break;
        case 'espeak':
          await this.speakEspeak(text);
          break;
        case 'system':
          await this.speakSystem(text);
          break;
      }
    } catch (error) {
      console.error('[TTS] Failed to speak:', error);
    } finally {
      this.isSpeaking = false;
      
      // Process queue
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        if (next) this.speak(next);
      }
    }
  }

  private async speakEspeak(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('espeak', [
        '-v', this.config.voice,
        '-s', this.config.rate.toString(),
        '-p', this.config.pitch.toString(),
        '-a', this.config.volume.toString(),
        text,
      ]);

      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`espeak exited with code ${code}`));
      });

      proc.on('error', reject);
    });
  }

  private async speakPiper(text: string): Promise<void> {
    // Piper is a fast local neural TTS
    const cmd = `echo "${text.replace(/"/g, '\\"')}" | piper-tts --model en_US-lessac-medium.onnx --output_raw | aplay -r 22050 -f S16_LE -t raw -`;
    await execAsync(cmd).catch(() => {
      // Fallback to espeak if piper not available
      return this.speakEspeak(text);
    });
  }

  private async speakSystem(text: string): Promise<void> {
    // Try system TTS (spd-say on Linux, say on macOS)
    const cmd = process.platform === 'darwin' 
      ? `say "${text.replace(/"/g, '\\"')}"`
      : `spd-say "${text.replace(/"/g, '\\"')}"`;
    
    await execAsync(cmd).catch(() => {
      // Fallback to espeak
      return this.speakEspeak(text);
    });
  }

  /**
   * Stop current speech
   */
  stop(): void {
    this.queue = [];
    if (process.platform === 'darwin') {
      exec('killall say');
    } else {
      exec('killall espeak spd-say');
    }
  }

  /**
   * Enable/disable TTS
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    if (!enabled) this.stop();
  }

  /**
   * Configure voice settings
   */
  configure(config: Partial<TTSConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Singleton export
export const ttsEngine = new TTSEngine();
