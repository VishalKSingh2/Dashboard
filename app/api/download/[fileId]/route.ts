import { NextRequest, NextResponse } from 'next/server';
import { getFileInfo, getDownloadStream } from '../../../../lib/gridfs';

/**
 * GET /api/download/[fileId]
 * 
 * Streams a file from MongoDB GridFS to the client.
 * This is the download URL referenced in the sequence diagram.
 * 
 * The fileId is a MongoDB ObjectId string stored in the job record
 * after report generation completes.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;

    if (!fileId || fileId.length !== 24) {
      return NextResponse.json(
        { error: 'Invalid file ID' },
        { status: 400 }
      );
    }

    // Get file metadata first
    const fileInfo = await getFileInfo(fileId);

    if (!fileInfo) {
      return NextResponse.json(
        { error: 'File not found or has expired' },
        { status: 404 }
      );
    }

    // Open download stream from GridFS
    const downloadStream = await getDownloadStream(fileId);

    // Convert Node.js readable stream to Web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        (downloadStream as any).on('data', (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });
        (downloadStream as any).on('end', () => {
          controller.close();
        });
        (downloadStream as any).on('error', (err: Error) => {
          controller.error(err);
        });
      },
    });

    // Determine content disposition based on filename
    const filename = encodeURIComponent(fileInfo.filename);

    return new Response(webStream, {
      status: 200,
      headers: {
        'Content-Type': fileInfo.contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': fileInfo.size.toString(),
        'Cache-Control': 'private, no-cache',
      },
    });
  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json(
      { error: 'Failed to download file' },
      { status: 500 }
    );
  }
}
