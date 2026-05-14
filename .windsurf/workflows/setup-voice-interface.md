---
description: Voice interface for Vera using Whisper + TTS
---

# Setup Voice Interface

Talk to Vera via voice. Whisper STT + Coqui TTS.

## Install

```bash
pip install openai-whisper TTS
```

## Voice API

```bash
cat > src/voice/voiceInterface.ts << 'EOF'
import express from 'express';
import multer from 'multer';
import { spawn } from 'child_process';
import fs from 'fs';

const upload = multer({ dest: '/tmp/vera-voice/' });

export const voiceRouter = express.Router();

voiceRouter.post('/transcribe', upload.single('audio'), (req, res) => {
  const audio = req.file?.path;
  if (!audio) return res.status(400).json({ error: 'no audio' });
  
  const whisper = spawn('whisper', [audio, '--model', 'base', '--output_format', 'json']);
  let out = '';
  whisper.stdout.on('data', d => out += d);
  whisper.on('close', () => {
    const result = JSON.parse(out || '{"text":""}');
    fs.unlinkSync(audio);
    res.json({ text: result.text });
  });
});

voiceRouter.post('/speak', (req, res) => {
  const { text } = req.body;
  const outputFile = `/tmp/vera-voice/out-${Date.now()}.wav`;
  
  const tts = spawn('tts', [
    '--text', text,
    '--model_name', 'tts_models/en/ljspeech/tacotron2-DDC',
    '--out_path', outputFile
  ]);
  
  tts.on('close', () => {
    res.sendFile(outputFile, () => fs.unlinkSync(outputFile));
  });
});
EOF
```

## Usage

```bash
# Transcribe audio
curl -X POST -F 'audio=@question.mp3' http://localhost:8088/api/voice/transcribe

# Text to speech
curl -X POST http://localhost:8088/api/voice/speak \
  -d '{"text":"Hello from the lattice"}' --output response.wav
```

## Full Voice Loop

```bash
cat > scripts/voice-chat.sh << 'EOF'
#!/bin/bash
while true; do
  echo "🎤 Recording (5s)..."
  arecord -d 5 /tmp/input.wav
  
  TEXT=$(curl -s -X POST -F 'audio=@/tmp/input.wav' http://localhost:8088/api/voice/transcribe | jq -r .text)
  echo "📝 You: $TEXT"
  
  RESPONSE=$(curl -s -X POST http://localhost:8088/api/ai/generate -d "{\"query\":\"$TEXT\"}" | jq -r .response)
  echo "🌸 Vera: $RESPONSE"
  
  curl -s -X POST http://localhost:8088/api/voice/speak -d "{\"text\":\"$RESPONSE\"}" --output /tmp/response.wav
  aplay /tmp/response.wav
done
EOF
chmod +x scripts/voice-chat.sh
```
