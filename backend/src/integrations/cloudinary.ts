import { v2 as cloudinary } from 'cloudinary';
import { env, features } from '../config/env.js';
import { unavailable } from '../utils/errors.js';

let configured = false;
function client() {
  if (!features.cloudinary) {
    throw unavailable('MEDIA_NOT_CONFIGURED', 'Photo and voice uploads are not set up on this server (Cloudinary keys missing)');
  }
  if (!configured) {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
}

export type ResourceType = 'image' | 'video';

/** Folder per patient keeps assets grouped and easy to purge. */
export const patientFolder = (patientId: string) => `${env.CLOUDINARY_FOLDER}/patients/${patientId}`;

/**
 * Parameters for a direct, signed browser upload. Assets are `authenticated`,
 * so they can only be viewed through signed URLs issued by this API.
 */
export function signUpload(patientId: string, resourceType: ResourceType) {
  const c = client();
  const timestamp = Math.round(Date.now() / 1000);
  const folder = patientFolder(patientId);
  const params = { timestamp, folder, type: 'authenticated' };
  const signature = c.utils.api_sign_request(params, env.CLOUDINARY_API_SECRET!);
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
    fields: { ...params, api_key: env.CLOUDINARY_API_KEY!, signature },
    resourceType,
  };
}

/** Confirm an uploaded asset exists and belongs to this patient's folder. */
export async function fetchResource(publicId: string, resourceType: ResourceType) {
  const c = client();
  const r = await c.api.resource(publicId, { resource_type: resourceType, type: 'authenticated' });
  return { publicId: r.public_id as string, format: r.format as string | undefined, bytes: r.bytes as number | undefined };
}

/** Short-lived signed delivery URL for an authenticated asset. */
export function deliveryUrl(publicId: string, resourceType: ResourceType, format?: string | null) {
  if (!features.cloudinary) return undefined;
  const c = client();
  return c.url(publicId, {
    resource_type: resourceType,
    type: 'authenticated',
    sign_url: true,
    secure: true,
    format: format ?? undefined,
  });
}

export async function destroyResource(publicId: string, resourceType: ResourceType) {
  if (!features.cloudinary) return;
  const c = client();
  await c.uploader.destroy(publicId, { resource_type: resourceType, type: 'authenticated', invalidate: true });
}
