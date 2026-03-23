import { Storage } from '@google-cloud/storage';
import { config } from '../utils/config';

const GRAPH_API = 'https://graph.facebook.com/v21.0';
const BUCKET_NAME = `${config.gcpProjectId}-temp-images`;

// --- GCS helpers for temporary image hosting ---

async function uploadToGCS(imageBuffer: Buffer, filename: string): Promise<string> {
  const storage = new Storage({ projectId: config.gcpProjectId });
  const bucket = storage.bucket(BUCKET_NAME);
  const file = bucket.file(filename);

  await file.save(imageBuffer, { contentType: 'image/png' });

  const [signedUrl] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 10 * 60 * 1000, // 10 minutes
  });

  return signedUrl;
}

async function deleteFromGCS(filename: string): Promise<void> {
  const storage = new Storage({ projectId: config.gcpProjectId });
  const bucket = storage.bucket(BUCKET_NAME);
  await bucket.file(filename).delete();
}

// --- Instagram publishing ---

export async function publishToInstagram(data: {
  imageBuffer: Buffer;
  caption: string;
  hashtags: string[];
}): Promise<{ postId: string }> {
  const filename = `post-${Date.now()}.png`;
  const imageUrl = await uploadToGCS(data.imageBuffer, filename);

  try {
    const fullCaption = `${data.caption}\n\n${data.hashtags.join(' ')}`;

    // Step 1: Create media container
    const createRes = await fetch(
      `${GRAPH_API}/${config.instagramAccountId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: imageUrl,
          caption: fullCaption,
          access_token: config.metaAccessToken,
        }),
      },
    );

    if (!createRes.ok) {
      const body = await createRes.text();
      throw new Error(`Meta media create failed (${createRes.status}): ${body}`);
    }

    const { id: creationId } = (await createRes.json()) as { id: string };

    // Step 2: Publish the container
    const publishRes = await fetch(
      `${GRAPH_API}/${config.instagramAccountId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: creationId,
          access_token: config.metaAccessToken,
        }),
      },
    );

    if (!publishRes.ok) {
      const body = await publishRes.text();
      throw new Error(`Meta media_publish failed (${publishRes.status}): ${body}`);
    }

    const { id: postId } = (await publishRes.json()) as { id: string };
    return { postId };
  } finally {
    await deleteFromGCS(filename).catch((err) =>
      console.error(`Failed to delete temp image ${filename}:`, err),
    );
  }
}

export async function publishCarousel(data: {
  images: Buffer[];
  caption: string;
  hashtags: string[];
}): Promise<{ postId: string }> {
  const fullCaption = `${data.caption}\n\n${data.hashtags.join(' ')}`;
  const filenames: string[] = [];

  try {
    // Step 1: Upload each image and create individual containers
    const childIds: string[] = [];
    for (let i = 0; i < data.images.length; i++) {
      const filename = `carousel-${Date.now()}-${i}.png`;
      filenames.push(filename);
      const imageUrl = await uploadToGCS(data.images[i], filename);

      const res = await fetch(
        `${GRAPH_API}/${config.instagramAccountId}/media`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_url: imageUrl,
            is_carousel_item: true,
            access_token: config.metaAccessToken,
          }),
        },
      );

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Meta carousel item create failed (${res.status}): ${body}`);
      }

      const { id } = (await res.json()) as { id: string };
      childIds.push(id);
    }

    // Step 2: Create carousel container
    const carouselRes = await fetch(
      `${GRAPH_API}/${config.instagramAccountId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'CAROUSEL',
          children: childIds.join(','),
          caption: fullCaption,
          access_token: config.metaAccessToken,
        }),
      },
    );

    if (!carouselRes.ok) {
      const body = await carouselRes.text();
      throw new Error(`Meta carousel create failed (${carouselRes.status}): ${body}`);
    }

    const { id: creationId } = (await carouselRes.json()) as { id: string };

    // Step 3: Publish the carousel
    const publishRes = await fetch(
      `${GRAPH_API}/${config.instagramAccountId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: creationId,
          access_token: config.metaAccessToken,
        }),
      },
    );

    if (!publishRes.ok) {
      const body = await publishRes.text();
      throw new Error(`Meta carousel publish failed (${publishRes.status}): ${body}`);
    }

    const { id: postId } = (await publishRes.json()) as { id: string };
    return { postId };
  } finally {
    // Clean up all uploaded images
    await Promise.allSettled(
      filenames.map((f) => deleteFromGCS(f)),
    );
  }
}

// --- Meta token refresh ---

export async function refreshMetaToken(): Promise<string> {
  const res = await fetch(
    `${GRAPH_API}/oauth/access_token?grant_type=fb_exchange_token&client_id=${config.metaAppId}&client_secret=${config.metaAppSecret}&fb_exchange_token=${config.metaAccessToken}`,
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta token refresh failed (${res.status}): ${body}`);
  }

  const { access_token } = (await res.json()) as { access_token: string };

  // Update secret in GCP Secret Manager
  const { SecretManagerServiceClient } = await import('@google-cloud/secret-manager' as string);
  const client = new SecretManagerServiceClient();
  const secretName = `projects/${config.gcpProjectId}/secrets/META_ACCESS_TOKEN`;

  await client.addSecretVersion({
    parent: secretName,
    payload: { data: Buffer.from(access_token) },
  });

  console.log('Meta access token refreshed and stored in Secret Manager');
  return access_token;
}
