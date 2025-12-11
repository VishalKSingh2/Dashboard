import { NextResponse } from 'next/server';
import { gzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);

interface CompressionOptions {
  threshold?: number; // Minimum size in bytes to compress (default: 1KB)
  level?: number; // Compression level 0-9 (default: 6)
}

/**
 * Compress JSON response if payload exceeds threshold
 * Automatically adds appropriate headers for compression
 */
export async function compressResponse<T = any>(
  data: T,
  options: CompressionOptions = {}
): Promise<NextResponse> {
  const { threshold = 1024, level = 6 } = options; // Default 1KB threshold

  try {
    // Serialize data to JSON with error handling
    let jsonString: string;
    try {
      jsonString = JSON.stringify(data);
    } catch (serializeError) {
      console.error('JSON serialization error:', serializeError);
      // Try to identify the problematic data
      console.error('Data type:', typeof data);
      throw new Error(`Failed to serialize response: ${serializeError instanceof Error ? serializeError.message : 'Unknown error'}`);
    }
    
    const originalSize = Buffer.byteLength(jsonString, 'utf8');

    // If payload is smaller than threshold, return uncompressed
    if (originalSize < threshold) {
      return NextResponse.json(data, {
        headers: {
          'Content-Type': 'application/json',
          'X-Uncompressed-Size': originalSize.toString(),
          'X-Compression': 'none',
        },
      });
    }

    // Compress the payload
    const compressed = await gzipAsync(Buffer.from(jsonString, 'utf8'), {
      level,
    });

    const compressedSize = compressed.length;
    const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(1);

    console.log(`Compression: ${originalSize} → ${compressedSize} bytes (${compressionRatio}% reduction)`);

    // Return compressed response with appropriate headers
    return new NextResponse(compressed, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
        'Content-Length': compressedSize.toString(),
        'X-Original-Size': originalSize.toString(),
        'X-Compressed-Size': compressedSize.toString(),
        'X-Compression-Ratio': compressionRatio,
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=120',
        'Vary': 'Accept-Encoding',
      },
    });
  } catch (error) {
    console.error('Compression error:', error);
    // Fallback to uncompressed response on error
    return NextResponse.json(data, {
      headers: {
        'X-Compression': 'error',
        'X-Compression-Error': error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}

/**
 * Calculate optimal compression settings based on data size
 */
export function getCompressionSettings(dataSize: number): CompressionOptions {
  if (dataSize < 1024) {
    // < 1KB: Don't compress
    return { threshold: Number.MAX_SAFE_INTEGER, level: 0 };
  } else if (dataSize < 10 * 1024) {
    // 1-10KB: Light compression for speed
    return { threshold: 1024, level: 3 };
  } else if (dataSize < 100 * 1024) {
    // 10-100KB: Balanced compression
    return { threshold: 1024, level: 6 };
  } else {
    // > 100KB: Maximum compression for bandwidth savings
    return { threshold: 1024, level: 9 };
  }
}

/**
 * Check if client supports compression
 */
export function supportsCompression(acceptEncoding?: string | null): boolean {
  if (!acceptEncoding) return false;
  return acceptEncoding.includes('gzip') || acceptEncoding.includes('br');
}

/**
 * Smart compression based on client capabilities and data size
 */
export async function smartCompress<T = any>(
  data: T,
  acceptEncoding?: string | null
): Promise<NextResponse> {
  // Check if client supports compression
  if (!supportsCompression(acceptEncoding)) {
    return NextResponse.json(data, {
      headers: {
        'X-Compression': 'unsupported',
      },
    });
  }

  // Estimate data size
  const estimatedSize = Buffer.byteLength(JSON.stringify(data), 'utf8');
  const settings = getCompressionSettings(estimatedSize);

  return compressResponse(data, settings);
}
