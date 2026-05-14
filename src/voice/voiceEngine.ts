/**
 * Vera Voice Engine
 * Speech recognition and synthesis for hands-free Vera control
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger.js';
import { getClient } from '../hedera/tools/client.js';

export interface VoiceConfig {
  wakeWord: string;
  language: string;
  continuousListening: boolean;
  confidenceThreshold: number;
  silenceTimeout: number;
  ttsEnabled: boolean;
  ttsVoice: string;
  ttsRate: number;
  ttsPitch: number;
  useElevenLabs: boolean;
  elevenLabsVoiceId: string;
  elevenLabsApiKey?: string;
}

export interface ElevenLabsVoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
}

export interface VoiceCommand {
  transcript: string;
  confidence: number;
  timestamp: number;
  isWakeWord: boolean;
  duration: number;
}

export interface TTSOptions {
  text: string;
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
}

export class VoiceEngine extends EventEmitter {
  private config: VoiceConfig;
  private recognition: any = null;
  private synthesis: SpeechSynthesis | null = null;
  private isListening = false;
  private isSpeaking = false;
  private wakeWordDetected = false;
  private silenceTimer: NodeJS.Timeout | null = null;
  private transcriptBuffer = '';

  // Web Speech API availability
  private speechRecognitionAvailable = false;
  private speechSynthesisAvailable = false;

  constructor(config: Partial<VoiceConfig> = {}) {
    super();
    this.config = {
      wakeWord: 'hey vera',
      language: 'en-US',
      continuousListening: true,
      confidenceThreshold: 0.7,
      silenceTimeout: 3000,
      ttsEnabled: true,
      ttsVoice: 'default',
      ttsRate: 1.0,
      ttsPitch: 1.0,
      useElevenLabs: true,
      elevenLabsVoiceId: 'XB0fDUnXU5powFXDhCwa', // Default "Scarlett" voice
      elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
      ...config,
    };

    this.initialize();
  }

  /**
   * Initialize speech APIs
   */
  private initialize(): void {
    // Check for Speech Recognition (browser environment)
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = this.config.continuousListening;
        this.recognition.interimResults = true;
        this.recognition.lang = this.config.language;
        this.speechRecognitionAvailable = true;

        this.recognition.onresult = this.handleRecognitionResult.bind(this);
        this.recognition.onerror = this.handleRecognitionError.bind(this);
        this.recognition.onend = this.handleRecognitionEnd.bind(this);
        this.recognition.onstart = this.handleRecognitionStart.bind(this);
      }
    }

    // Check for Speech Synthesis
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      this.synthesis = window.speechSynthesis;
      this.speechSynthesisAvailable = true;
    }

    logger.info('VoiceEngine', {
      message: 'Voice engine initialized',
      recognitionAvailable: this.speechRecognitionAvailable,
      synthesisAvailable: this.speechSynthesisAvailable,
      wakeWord: this.config.wakeWord,
    });
  }

  /**
   * Start listening for voice commands
   */
  startListening(): void {
    if (!this.speechRecognitionAvailable) {
      logger.warn('VoiceEngine', { message: 'Speech recognition not available' });
      this.emit('error', { type: 'not_available', message: 'Speech recognition not available' });
      return;
    }

    if (this.isListening) return;

    try {
      this.recognition.start();
    } catch (error) {
      logger.error('VoiceEngine', { message: 'Failed to start recognition', error });
    }
  }

  /**
   * Stop listening
   */
  stopListening(): void {
    if (!this.speechRecognitionAvailable || !this.isListening) return;

    try {
      this.recognition.stop();
    } catch (error) {
      logger.error('VoiceEngine', { message: 'Failed to stop recognition', error });
    }
  }

  /**
   * Handle recognition results
   */
  private handleRecognitionResult(event: any): void {
    const results = event.results;
    
    for (let i = event.resultIndex; i < results.length; i++) {
      const result = results[i];
      const transcript = result[0].transcript.toLowerCase().trim();
      const confidence = result[0].confidence;

      // Check for wake word if not already activated
      if (!this.wakeWordDetected && this.detectWakeWord(transcript)) {
        this.wakeWordDetected = true;
        this.transcriptBuffer = '';
        
        this.emit('wake_word', {
          transcript,
          confidence,
          timestamp: Date.now(),
        });

        logger.info('VoiceEngine', { message: 'Wake word detected', transcript });
        continue;
      }

      // Process command after wake word
      if (this.wakeWordDetected) {
        if (result.isFinal) {
          this.transcriptBuffer = transcript;
          
          const command: VoiceCommand = {
            transcript: this.cleanCommand(transcript),
            confidence,
            timestamp: Date.now(),
            isWakeWord: false,
            duration: 0, // Will be calculated if needed
          };

          this.emit('command', command);
          logger.info('VoiceEngine', { message: 'Command detected', command: command.transcript });

          // Reset for next command
          this.wakeWordDetected = false;
          this.transcriptBuffer = '';
        } else {
          // Emit interim results for real-time feedback
          this.emit('interim', { transcript, confidence });
        }
      }
    }
  }

  /**
   * Detect wake word in transcript
   */
  private detectWakeWord(transcript: string): boolean {
    const wakeWords = [
      this.config.wakeWord,
      'hey veera',
      'vera',
      'ok vera',
      'okay vera',
      'hi vera',
      'hello vera',
    ];

    return wakeWords.some(ww => transcript.includes(ww));
  }

  /**
   * Clean command by removing wake words
   */
  private cleanCommand(transcript: string): string {
    const wakeWords = [
      'hey vera',
      'hey veera',
      'vera',
      'ok vera',
      'okay vera',
      'hi vera',
      'hello vera',
    ];

    let cleaned = transcript;
    for (const ww of wakeWords) {
      cleaned = cleaned.replace(ww, '').trim();
    }

    return cleaned;
  }

  /**
   * Handle recognition errors
   */
  private handleRecognitionError(event: any): void {
    logger.error('VoiceEngine', {
      message: 'Recognition error',
      error: event.error,
    });

    this.emit('error', {
      type: event.error,
      message: `Recognition error: ${event.error}`,
    });

    // Auto-restart on certain errors if continuous listening is enabled
    if (this.config.continuousListening && event.error === 'no-speech') {
      setTimeout(() => this.startListening(), 1000);
    }
  }

  /**
   * Handle recognition start
   */
  private handleRecognitionStart(): void {
    this.isListening = true;
    this.emit('listening_start');
    logger.info('VoiceEngine', { message: 'Started listening' });
  }

  /**
   * Handle recognition end
   */
  private handleRecognitionEnd(): void {
    this.isListening = false;
    this.emit('listening_end');
    logger.info('VoiceEngine', { message: 'Stopped listening' });

    // Auto-restart if continuous listening is enabled
    if (this.config.continuousListening) {
      setTimeout(() => this.startListening(), 500);
    }
  }

  /**
   * Speak text using TTS (ElevenLabs or native)
   */
  async speak(text: string, options: Partial<TTSOptions> = {}): Promise<void> {
    if (!this.config.ttsEnabled) return;

    if (this.config.useElevenLabs && this.config.elevenLabsApiKey) {
      return this.speakElevenLabs(text, options);
    } else {
      return this.speakNative(text, options);
    }
  }

  /**
   * Speak using ElevenLabs API (high-quality voice)
   */
  private async speakElevenLabs(text: string, options: Partial<TTSOptions> = {}): Promise<void> {
    try {
      this.isSpeaking = true;
      this.emit('speak_start', { text, provider: 'elevenlabs' });

      const voiceId = options.voice || this.config.elevenLabsVoiceId || 'XB0fDUnXU5powFXDhCwa';
      const voiceSettings: ElevenLabsVoiceSettings = {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.5,
        use_speaker_boost: true,
      };

      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.config.elevenLabsApiKey!,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: voiceSettings,
          output_format: 'mp3_44100_128',
        }),
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.status}`);
      }

      // Play the audio
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      audio.onended = () => {
        this.isSpeaking = false;
        this.emit('speak_end');
        URL.revokeObjectURL(audioUrl);
      };

      audio.onerror = () => {
        this.isSpeaking = false;
        this.emit('speak_end');
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();

    } catch (error) {
      logger.error('VoiceEngine', { message: 'ElevenLabs TTS failed, falling back to native', error });
      this.isSpeaking = false;
      // Fallback to native TTS
      return this.speakNative(text, options);
    }
  }

  /**
   * Speak using native browser TTS
   */
  private speakNative(text: string, options: Partial<TTSOptions> = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.speechSynthesisAvailable) {
        reject(new Error('Speech synthesis not available'));
        return;
      }

      if (!this.config.ttsEnabled) {
        resolve();
        return;
      }

      // Cancel any ongoing speech
      this.synthesis!.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = options.rate ?? this.config.ttsRate;
      utterance.pitch = options.pitch ?? this.config.ttsPitch;
      utterance.volume = options.volume ?? 1.0;
      utterance.lang = this.config.language;

      // Select voice if specified
      if (options.voice || this.config.ttsVoice !== 'default') {
        const voices = this.synthesis!.getVoices();
        const preferredVoice = voices.find(v => 
          v.name.toLowerCase().includes((options.voice || this.config.ttsVoice).toLowerCase())
        );
        if (preferredVoice) {
          utterance.voice = preferredVoice;
        }
      }

      utterance.onstart = () => {
        this.isSpeaking = true;
        this.emit('speak_start', { text });
      };

      utterance.onend = () => {
        this.isSpeaking = false;
        this.emit('speak_end');
        resolve();
      };

      utterance.onerror = (event) => {
        this.isSpeaking = false;
        logger.error('VoiceEngine', { message: 'TTS error', error: event });
        reject(event);
      };

      this.synthesis.speak(utterance);
    });
  }

  /**
   * Stop speaking
   */
  stopSpeaking(): void {
    if (this.synthesis) {
      this.synthesis.cancel();
      this.isSpeaking = false;
    }
  }

  /**
   * Get available voices
   */
  getVoices(): SpeechSynthesisVoice[] {
    if (!this.synthesis) return [];
    return this.synthesis.getVoices();
  }

  /**
   * Check if currently listening
   */
  isCurrentlyListening(): boolean {
    return this.isListening;
  }

  /**
   * Check if currently speaking
   */
  isCurrentlySpeaking(): boolean {
    return this.isSpeaking;
  }

  /**
   * Check if wake word is active (command mode)
   */
  isCommandMode(): boolean {
    return this.wakeWordDetected;
  }

  /**
   * Get current config
   */
  getConfig(): VoiceConfig {
    return { ...this.config };
  }

  /**
   * Update config
   */
  updateConfig(config: Partial<VoiceConfig>): void {
    this.config = { ...this.config, ...config };

    // Update recognition settings
    if (this.recognition) {
      this.recognition.lang = this.config.language;
      this.recognition.continuous = this.config.continuousListening;
    }

    logger.info('VoiceEngine', { message: 'Config updated', config: this.config });
  }

  /**
   * Get engine status
   */
  getStatus(): {
    recognitionAvailable: boolean;
    synthesisAvailable: boolean;
    isListening: boolean;
    isSpeaking: boolean;
    wakeWordActive: boolean;
    language: string;
  } {
    return {
      recognitionAvailable: this.speechRecognitionAvailable,
      synthesisAvailable: this.speechSynthesisAvailable,
      isListening: this.isListening,
      isSpeaking: this.isSpeaking,
      wakeWordActive: this.wakeWordDetected,
      language: this.config.language,
    };
  }
}

// Singleton
export const voiceEngine = new VoiceEngine();
export default voiceEngine;
