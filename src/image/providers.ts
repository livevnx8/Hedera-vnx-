import axios from 'axios';
import { config } from '../config.js';

export interface ImageGenRequest {
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  steps?: number;
}

export interface ImageGenResult {
  b64?: string;
  url?: string;
  format: string;
  provider: string;
}

export async function generateImage(req: ImageGenRequest): Promise<ImageGenResult> {
  const { IMAGE_PROVIDER } = config;

  if (IMAGE_PROVIDER === 'disabled') {
    throw new Error('Image generation is disabled. Set IMAGE_PROVIDER in your .env file.');
  }

  if (IMAGE_PROVIDER === 'automatic1111') {
    return generateAutomatic1111(req);
  }

  if (IMAGE_PROVIDER === 'stability') {
    return generateStability(req);
  }

  if (IMAGE_PROVIDER === 'replicate') {
    return generateReplicate(req);
  }

  if (IMAGE_PROVIDER === 'local') {
    return generateLocal(req);
  }

  throw new Error(`Unknown IMAGE_PROVIDER: ${IMAGE_PROVIDER}`);
}

async function generateAutomatic1111(req: ImageGenRequest): Promise<ImageGenResult> {
  const response = await axios.post(`${config.IMAGE_PROVIDER_URL}/sdapi/v1/txt2img`, {
    prompt: req.prompt,
    negative_prompt: req.negative_prompt ?? '',
    width: req.width ?? 512,
    height: req.height ?? 512,
    steps: req.steps ?? 20,
    sampler_name: 'DPM++ 2M Karras',
    cfg_scale: 7,
  });

  const b64 = (response.data as { images: string[] }).images[0];
  return { b64, format: 'png', provider: 'automatic1111' };
}

async function generateStability(req: ImageGenRequest): Promise<ImageGenResult> {
  if (!config.STABILITY_API_KEY) throw new Error('STABILITY_API_KEY is required for stability provider.');

  const response = await axios.post(
    'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
    {
      text_prompts: [
        { text: req.prompt, weight: 1 },
        ...(req.negative_prompt ? [{ text: req.negative_prompt, weight: -1 }] : []),
      ],
      width: req.width ?? 1024,
      height: req.height ?? 1024,
      steps: req.steps ?? 30,
      cfg_scale: 7,
      samples: 1,
    },
    {
      headers: {
        Authorization: `Bearer ${config.STABILITY_API_KEY}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    }
  );

  const artifact = (response.data as { artifacts: Array<{ base64: string }> }).artifacts[0];
  return { b64: artifact.base64, format: 'png', provider: 'stability' };
}

async function generateReplicate(req: ImageGenRequest): Promise<ImageGenResult> {
  if (!config.REPLICATE_API_KEY) throw new Error('REPLICATE_API_KEY is required for replicate provider.');

  const createResp = await axios.post(
    'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions',
    {
      input: {
        prompt: req.prompt,
        width: req.width ?? 1024,
        height: req.height ?? 1024,
        num_inference_steps: req.steps ?? 4,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${config.REPLICATE_API_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'wait',
      },
    }
  );

  const prediction = createResp.data as { id: string; status: string; output?: string[] };

  if (prediction.status === 'succeeded' && prediction.output?.[0]) {
    return { url: prediction.output[0], format: 'webp', provider: 'replicate' };
  }

  const pollUrl = `https://api.replicate.com/v1/predictions/${prediction.id}`;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const poll = await axios.get<{ status: string; output?: string[]; error?: string }>(pollUrl, {
      headers: { Authorization: `Bearer ${config.REPLICATE_API_KEY}` },
    });
    if (poll.data.status === 'succeeded' && poll.data.output?.[0]) {
      return { url: poll.data.output[0], format: 'webp', provider: 'replicate' };
    }
    if (poll.data.status === 'failed') {
      throw new Error(`Replicate prediction failed: ${poll.data.error ?? 'unknown error'}`);
    }
  }

  throw new Error('Replicate image generation timed out after 90 seconds.');
}

async function generateLocal(req: ImageGenRequest): Promise<ImageGenResult> {
  const url = config.IMAGE_PROVIDER_URL.replace(/\/$/, '');
  const response = await axios.post<{ b64: string; format: string }>(`${url}/generate`, {
    prompt: req.prompt,
    negative_prompt: req.negative_prompt ?? 'blurry, low quality, distorted, deformed',
    width: req.width ?? 512,
    height: req.height ?? 512,
    steps: req.steps ?? 12,
  });
  return { b64: response.data.b64, format: response.data.format ?? 'png', provider: 'local' };
}

export async function startLocalImageJob(req: ImageGenRequest): Promise<string> {
  const url = config.IMAGE_PROVIDER_URL.replace(/\/$/, '');
  const res = await axios.post<{ jobId: string }>(`${url}/generate/start`, {
    prompt: req.prompt,
    negative_prompt: req.negative_prompt ?? 'blurry, low quality, distorted, deformed',
    width: req.width ?? 512,
    height: req.height ?? 512,
    steps: req.steps ?? 12,
  });
  return res.data.jobId;
}

export async function pollLocalImageJob(jobId: string): Promise<{
  status: string; b64?: string; format?: string; elapsed_s?: number; error?: string;
}> {
  const url = config.IMAGE_PROVIDER_URL.replace(/\/$/, '');
  const res = await axios.get<{
    status: string; b64?: string; format?: string; elapsed_s?: number; error?: string;
  }>(`${url}/generate/status/${jobId}`);
  return res.data;
}

export async function generateVideo(params: { prompt: string }): Promise<{ jobId: string; pollUrl: string }> {
  if (config.VIDEO_PROVIDER === 'disabled') {
    throw new Error('Video generation is disabled. Set VIDEO_PROVIDER=replicate in your .env file.');
  }

  if (!config.REPLICATE_API_KEY) throw new Error('REPLICATE_API_KEY is required for video generation.');

  const createResp = await axios.post(
    `https://api.replicate.com/v1/models/${config.REPLICATE_VIDEO_MODEL}/predictions`,
    { input: { prompt: params.prompt } },
    {
      headers: {
        Authorization: `Bearer ${config.REPLICATE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const prediction = createResp.data as { id: string };
  return {
    jobId: prediction.id,
    pollUrl: `https://api.replicate.com/v1/predictions/${prediction.id}`,
  };
}

export async function pollVideoJob(jobId: string): Promise<{
  status: string;
  url?: string;
  error?: string;
}> {
  if (!config.REPLICATE_API_KEY) throw new Error('REPLICATE_API_KEY is required.');

  const poll = await axios.get<{ status: string; output?: string; error?: string }>(
    `https://api.replicate.com/v1/predictions/${jobId}`,
    { headers: { Authorization: `Bearer ${config.REPLICATE_API_KEY}` } }
  );

  return {
    status: poll.data.status,
    url: poll.data.output ?? undefined,
    error: poll.data.error ?? undefined,
  };
}
