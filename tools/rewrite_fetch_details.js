async function fetchPlaceDetails(placeId) {
  if (!placesService) {
    throw new Error('Places service가 초기화되지 않았습니다.');
  }
  return new Promise((resolve, reject) => {
    placesService.getDetails(
      {
        placeId,
        language: 'ko',
        fields: [
          'place_id',
          'name',
          'formatted_address',
          'geometry',
          'website',
          'formatted_phone_number',
          'opening_hours',
          'photos',
          'rating',
          'user_ratings_total',
          'reviews',
        ],
      },
      (result, status) => {
        if (status === googleMaps.maps.places.PlacesServiceStatus.OK && result) {
          resolve(result);
        } else {
          reject(new Error(장소 정보를 불러오지 못했습니다: ));
        }
      }
    );
  });
}
