import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { generateImage, generateVideo, pollVideoJob, startLocalImageJob, pollLocalImageJob } from '../image/providers.js';
import { config } from '../config.js';

const ImageBodySchema = z.object({
  prompt: z.string().min(1),
  negative_prompt: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  steps: z.number().int().positive().optional(),
});

const VideoBodySchema = z.object({
  prompt: z.string().min(1),
});

export async function registerImageRoutes(app: FastifyInstance) {
  app.post('/v1/image/start', async (req: FastifyRequest, reply: FastifyReply) => {
    if (config.IMAGE_PROVIDER !== 'local') {
      return reply.status(400).send({ error: { message: 'Async jobs only supported with IMAGE_PROVIDER=local' } });
    }
    const parsed = ImageBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { message: 'Invalid request body', details: parsed.error.flatten() } });
    }
    try {
      const reqData = parsed.data;
      const jobId = await startLocalImageJob({
        prompt: reqData.prompt,
        negative_prompt: reqData.negative_prompt,
        width: reqData.width,
        height: reqData.height,
        steps: reqData.steps
      });
      return reply.send({ ok: true, jobId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: { message } });
    }
  });

  app.get('/v1/image/poll/:jobId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { jobId } = req.params as { jobId: string };
    try {
      const result = await pollLocalImageJob(jobId);
      return reply.send({ ok: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: { message } });
    }
  });

  app.post('/v1/image', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = ImageBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { message: 'Invalid request body', details: parsed.error.flatten() } });
    }

    try {
      const reqData = parsed.data;
      const result = await generateImage({
        prompt: reqData.prompt,
        negative_prompt: reqData.negative_prompt,
        width: reqData.width,
        height: reqData.height,
        steps: reqData.steps
      });
      return reply.send({ ok: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: { message } });
    }
  });

  app.post('/v1/video', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = VideoBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { message: 'Invalid request body', details: parsed.error.flatten() } });
    }

    try {
      const result = await generateVideo({ prompt: parsed.data.prompt });
      return reply.send({ ok: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: { message } });
    }
  });

  app.get('/v1/video/:jobId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { jobId } = req.params as { jobId: string };
    try {
      const result = await pollVideoJob(jobId);
      return reply.send({ ok: true, jobId, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: { message } });
    }
  });
}
