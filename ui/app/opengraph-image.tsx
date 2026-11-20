import { headers } from 'next/headers';
import { ImageResponse } from 'next/og';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getAppConfig } from '@/lib/utils';

// Image metadata
export const alt = 'Personal Autonomous Agent';
export const size = {
  width: 1200,
  height: 628,
};

// LOCAL FILES MUST BE IN PUBLIC FOLDER
async function loadFileData(filePath: string): Promise<ArrayBuffer> {
  if (existsSync(join(process.cwd(), filePath))) {
    const buffer = await readFile(join(process.cwd(), filePath));
    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ) as ArrayBuffer;
  }

  // Fallback to fetching from public URL (works in production)
  const publicFilePath = filePath.replace('public/', '');
  const fontUrl = `https://${process.env.VERCEL_URL}/${publicFilePath}`;

  const response = await fetch(fontUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${fontUrl} - ${response.status} ${response.statusText}`);
  }

  return await response.arrayBuffer();
}

<<<<<<< HEAD
=======
async function getImageData(uri: string, fallbackUri?: string): Promise<ImageData> {
  try {
    const fileData = await loadFileData(uri);
    const buffer = Buffer.from(fileData);
    const mimeType = mime.getType(uri);

    return {
      base64: `data:${mimeType};base64,${buffer.toString('base64')}`,
      dimensions: getImageSize(buffer),
    };
  } catch (e) {
    if (fallbackUri) {
      return getImageData(fallbackUri, fallbackUri);
    }
    throw e;
  }
}

function scaleImageSize(size: { width: number; height: number }, desiredHeight: number) {
  const scale = desiredHeight / size.height;
  return {
    width: size.width * scale,
    height: desiredHeight,
  };
}

function cleanPageTitle(appName: string) {
  if (appName === APP_CONFIG_DEFAULTS.pageTitle) {
    return 'AI voice tutor';
  }

  return appName;
}

>>>>>>> 68f2d672499f5e755fdd42e08361f321da03d83b
export const contentType = 'image/png';

// Image generation
export default async function Image() {
  const hdrs = await headers();
  const appConfig = await getAppConfig(hdrs);

  // Load fonts - use file system in dev, fetch in production
  let commitMonoData: ArrayBuffer | undefined;
  let everettLightData: ArrayBuffer | undefined;

  try {
    commitMonoData = await loadFileData('public/commit-mono-400-regular.woff');
    everettLightData = await loadFileData('public/everett-light.woff');
  } catch (e) {
    console.error('Failed to load fonts:', e);
    // Continue without custom fonts - will fall back to system fonts
  }

  return new ImageResponse(
    // ImageResponse JSX element
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size.width,
        height: size.height,
        backgroundImage: `url(${bgSrcBase64})`,
        backgroundSize: '100% 100%',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* wordmark */}
      <div
        style={{
          position: 'absolute',
          top: 30,
          left: 30,
          display: 'flex',
<<<<<<< HEAD
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'flex-end',
          width: size.width,
          height: size.height,
          padding: 64,
          backgroundColor: '#000000',
          backgroundImage:
            'radial-gradient(circle at 78% 18%, rgba(76, 111, 255, 0.28) 0%, rgba(0, 0, 0, 0) 55%), radial-gradient(circle at 12% 92%, rgba(41, 98, 255, 0.16) 0%, rgba(0, 0, 0, 0) 50%)',
=======
          alignItems: 'center',
          gap: 10,
        }}
      >
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <img src={wordmarkSrcBase64} width={wordmarkSize.width} height={wordmarkSize.height} />
      </div>
      {/* logo */}
      <div
        style={{
          position: 'absolute',
          top: 200,
          left: 460,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <img src={logoSrcBase64} width={logoSize.width} height={logoSize.height} />
      </div>
      {/* title */}
      <div
        style={{
          position: 'absolute',
          bottom: 100,
          left: 30,
          width: '380px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
>>>>>>> 68f2d672499f5e755fdd42e08361f321da03d83b
        }}
      >
        <div
          style={{
<<<<<<< HEAD
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 28,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              borderRadius: 999,
              border: '1px solid rgba(138, 180, 255, 0.35)',
              backgroundColor: 'rgba(76, 111, 255, 0.14)',
              padding: '6px 14px',
              fontSize: 12,
              fontFamily: 'CommitMono',
              fontWeight: 600,
              color: '#8ab4ff',
              letterSpacing: 1.2,
              textTransform: 'uppercase',
            }}
          >
            Live voice session
          </div>
=======
            backgroundColor: '#1F1F1F',
            padding: '2px 8px',
            borderRadius: 4,
            width: 72,
            fontSize: 12,
            fontFamily: 'CommitMono',
            fontWeight: 600,
            color: '#999999',
            letterSpacing: 0.8,
          }}
        >
          SANDBOX
        </div>
        <div
          style={{
            fontSize: 48,
            fontWeight: 300,
            fontFamily: 'Everett',
            color: 'white',
            lineHeight: 1,
          }}
        >
          {pageTitle}
>>>>>>> 68f2d672499f5e755fdd42e08361f321da03d83b
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 68,
            fontWeight: 300,
            fontFamily: 'Everett',
            color: '#ffffff',
            lineHeight: 1.05,
            letterSpacing: -1,
          }}
        >
          {appConfig.pageTitle}
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 20,
            maxWidth: 720,
            fontSize: 24,
            fontFamily: 'Public Sans, sans-serif',
            color: 'rgba(255, 255, 255, 0.62)',
            lineHeight: 1.3,
          }}
        >
          {appConfig.pageDescription}
        </div>
      </div>
    </div>,
    // ImageResponse options
    {
      // For convenience, we can re-use the exported opengraph-image
      // size config to also set the ImageResponse's width and height.
      ...size,
      fonts: [
        ...(commitMonoData
          ? [
            {
              name: 'CommitMono',
              data: commitMonoData,
              style: 'normal' as const,
              weight: 400 as const,
            },
          ]
          : []),
        ...(everettLightData
          ? [
            {
              name: 'Everett',
              data: everettLightData,
              style: 'normal' as const,
              weight: 300 as const,
            },
          ]
          : []),
      ],
    }
  );
}
