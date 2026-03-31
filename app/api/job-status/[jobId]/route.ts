import { NextRequest } from 'next/server';
import { getJob } from '@/lib/jobs';
import { JobSSEEvent } from '@/lib/jobs';

export const dynamic = 'force-dynamic';

/**
 * GET /api/job-status/[jobId]
 *
 * Server-Sent Events (SSE) endpoint that streams job progress
 * to the client. Polls MongoDB every 2 seconds until the job
 * completes or fails, then closes the stream.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  if (!jobId) {
    return new Response(JSON.stringify({ error: 'Job ID is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: JobSSEEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const poll = async () => {
        while (!closed) {
          try {
            const job = await getJob(jobId);

            if (!job) {
              send({
                type: 'failed',
                jobId,
                status: 'failed',
                phase: 'failed',
                progress: 0,
                errorMessage: 'Job not found',
                timestamp: new Date().toISOString(),
              });
              break;
            }

            const event: JobSSEEvent = {
              type:
                job.status === 'completed'
                  ? 'completed'
                  : job.status === 'failed'
                    ? 'failed'
                    : 'progress',
              jobId: job.jobId,
              status: job.status,
              phase: job.phase,
              progress: job.progress,
              timestamp: new Date().toISOString(),
            };

            // Attach completion fields
            if (job.status === 'completed') {
              event.downloadUrl = job.downloadUrl;
              event.fileName = job.fileName;
              event.fileSize = job.fileSize;
              event.recordCount = job.recordCount;
            }

            // Attach failure fields
            if (job.status === 'failed') {
              event.errorMessage = job.errorMessage;
            }

            // Attach progress details
            if (job.progressDetails) {
              event.progressDetails = job.progressDetails;
            }

            send(event);

            // Stop polling on terminal states
            if (job.status === 'completed' || job.status === 'failed') {
              break;
            }
          } catch (err) {
            console.error('SSE poll error:', err);
            send({
              type: 'failed',
              jobId,
              status: 'failed',
              phase: 'failed',
              progress: 0,
              errorMessage: 'Internal polling error',
              timestamp: new Date().toISOString(),
            });
            break;
          }

          // Wait 2 seconds before next poll
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        // Close the stream
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      };

      poll();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
