// Wires Google Places Autocomplete to input elements and notifies listeners on selection.
const SESSION_TOKEN_DURATION_MS = 3 * 60 * 1000; // reuse token for up to 3 minutes per session

let googleRef;
let autocompleteSessionToken;
// let currentCountryCode = "kr"; // 기본값은 한국

export function initAutocomplete(google, elements, { onOriginSelect, onDestinationSelect, onWaypointSelect }) {
  googleRef = google;
  ensureSessionToken();

  attachAutocomplete(elements.origin, onOriginSelect);
  attachAutocomplete(elements.destination, onDestinationSelect);
  attachAutocomplete(elements.waypointInput, onWaypointSelect, { onEnter: elements.addWaypoint.click.bind(elements.addWaypoint) });
}

// export function updateAutocompleteRegion(countryCode) {
//   currentCountryCode = countryCode || "kr";
// }

function attachAutocomplete(input, onPlaceSelected, { onEnter } = {}) {
  if (!input) return;

  const autocomplete = new googleRef.maps.places.Autocomplete(input, {
    fields: ["formatted_address", "geometry", "place_id", "name"],
    // 국가별 제한을 원할 경우 아래 주석을 해제하고 위의 updateAutocompleteRegion 로직을 활성화하세요
    // componentRestrictions: { country: currentCountryCode },
  });

  autocomplete.setOptions({
    strictBounds: false,
    sessionToken: autocompleteSessionToken,
  });

  autocomplete.addListener("place_changed", () => {
    const place = autocomplete.getPlace();
    if (!place?.geometry || !place.formatted_address) {
      // geometry가 없는 경우는 검색어만 입력하고 선택하지 않은 상황
      return;
    }
    onPlaceSelected?.(normalizePlace(place));
    ensureSessionToken(true);
  });

  if (onEnter) {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onEnter();
      }
    });
  }
}

function normalizePlace(place) {
  return {
    placeId: place.place_id,
    name: place.name,
    address: place.formatted_address,
    location: place.geometry?.location?.toJSON?.() ?? null,
  };
}

function ensureSessionToken(forceNew = false) {
  if (!googleRef) return;
  if (!autocompleteSessionToken || forceNew) {
    autocompleteSessionToken = new googleRef.maps.places.AutocompleteSessionToken();
    setTimeout(() => {
      autocompleteSessionToken = null;
    }, SESSION_TOKEN_DURATION_MS);
  }
}
