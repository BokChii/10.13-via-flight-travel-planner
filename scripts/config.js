// Reads configuration values exposed through DOM metadata.
const META_GOOGLE_MAPS_KEY = "google-maps-api-key";

export function getGoogleMapsApiKey() {
  const metaTag = document.querySelector(`meta[name="${META_GOOGLE_MAPS_KEY}"]`);
  const value = metaTag?.content?.trim();
  return value || "";
}

