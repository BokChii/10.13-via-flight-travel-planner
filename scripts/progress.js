export function calculateNavigationProgress(routePlan, position, originalSegments = null) {
  if (!routePlan || !position || !routePlan.segments?.length) {
    return null;
  }

  const totalDistanceMeters = routePlan.totalDistanceMeters ?? 0;

  let cumulativeBeforeSegment = 0;
  let closest = null;

  routePlan.segments.forEach((segment, segmentIndex) => {
    const legs = segment.legs || [];
    let cumulativeWithinSegment = 0;

    legs.forEach((leg, legIndex) => {
      // 원본 DirectionsResult에서 실제 폴리라인 경로 가져오기
      let minDistance = Infinity;
      let fractionAlong = 0;
      
      if (originalSegments && originalSegments[segmentIndex]) {
        const originalRoute = originalSegments[segmentIndex]?.routes?.[0];
        const originalLeg = originalRoute?.legs?.[legIndex];
        
        if (originalLeg?.steps) {
          // 모든 step의 polyline을 디코딩하여 실제 경로 좌표 얻기
          const allPathPoints = [];
          originalLeg.steps.forEach(step => {
            if (step.polyline?.points) {
              const decoded = decodePolyline(step.polyline.points);
              allPathPoints.push(...decoded);
            }
          });
          
          if (allPathPoints.length > 0) {
            const polylineMetrics = distanceToPolyline(position, allPathPoints);
            minDistance = polylineMetrics.distance;
            fractionAlong = polylineMetrics.fractionAlong;
          }
        }
      }
      
      // 폴리라인 경로가 없으면 기존 방식 사용 (fallback)
      if (minDistance === Infinity) {
        const start = parseLatLng(leg.originLocation);
        const end = parseLatLng(leg.destinationLocation);
        if (!start || !end) {
          cumulativeWithinSegment += leg.distanceValue ?? 0;
          return;
        }
        const metrics = projectPointMetrics(start, end, position);
        minDistance = metrics.distance;
        fractionAlong = metrics.fractionAlong;
      }

      const legDistance = leg.distanceValue || 0;

      if (!closest || minDistance < closest.distanceToLegMeters) {
        closest = {
          segmentIndex,
          legIndex,
          distanceToLegMeters: minDistance,
          cumulativeBeforeSegment,
          cumulativeWithinSegment,
          legTravelled: clamp(
            legDistance * fractionAlong,
            0,
            legDistance
          ),
          legDistance,
        };
      }

      cumulativeWithinSegment += legDistance;
    });

    cumulativeBeforeSegment += segment.distanceMeters ?? cumulativeWithinSegment;
  });

  if (!closest) return null;

  const cumulativeBeforeLeg =
    closest.cumulativeBeforeSegment + closest.cumulativeWithinSegment;
  const travelledMeters = cumulativeBeforeLeg + closest.legTravelled;
  const remainingMeters = Math.max(totalDistanceMeters - travelledMeters, 0);
  const progressRatio = totalDistanceMeters > 0 ? clamp(travelledMeters / totalDistanceMeters, 0, 1) : 0;

  return {
    closestSegmentIndex: closest.segmentIndex,
    closestLegIndex: closest.legIndex,
    distanceToLegMeters: closest.distanceToLegMeters,
    travelledMeters,
    remainingMeters,
    progressRatio,
  };
}

function parseLatLng(value) {
  if (!value) return null;
  if (typeof value.lat === "number" && typeof value.lng === "number") {
    return { lat: value.lat, lng: value.lng };
  }
  if (Array.isArray(value) && value.length === 2) {
    return { lat: value[0], lng: value[1] };
  }
  return null;
}

function projectPointMetrics(start, end, point) {
  const startCartesian = toCartesian(start);
  const endCartesian = toCartesian(end);
  const pointCartesian = toCartesian(point);

  const segmentVector = subtract(endCartesian, startCartesian);
  const pointVector = subtract(pointCartesian, startCartesian);

  const segmentLengthSquared = dot(segmentVector, segmentVector);
  const fractionAlong = segmentLengthSquared > 0 ? clamp(dot(pointVector, segmentVector) / segmentLengthSquared, 0, 1) : 0;

  const projection = {
    x: startCartesian.x + segmentVector.x * fractionAlong,
    y: startCartesian.y + segmentVector.y * fractionAlong,
  };

  const distance = euclideanDistance(pointCartesian, projection);
  const legLength = Math.sqrt(segmentLengthSquared);

  return {
    distance,
    fractionAlong,
    legLength,
  };
}

function toCartesian({ lat, lng }) {
  const R = 6371e3;
  const φ = toRad(lat);
  const λ = toRad(lng);
  return {
    x: R * λ * Math.cos(φ),
    y: R * φ,
  };
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

function euclideanDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Google Maps polyline 디코딩 함수
 * @param {string} encoded - 인코딩된 polyline 문자열
 * @returns {Array} 디코딩된 좌표 배열 [{lat, lng}, ...]
 */
function decodePolyline(encoded) {
  const poly = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    poly.push({ lat: lat * 1e-5, lng: lng * 1e-5 });
  }
  return poly;
}

/**
 * 실제 폴리라인 경로로부터 가장 가까운 거리 계산
 * @param {Object} position - 현재 위치 {lat, lng}
 * @param {Array} polyline - 폴리라인 좌표 배열 [{lat, lng}, ...]
 * @returns {Object} {distance: 거리(미터), fractionAlong: 경로상 위치 비율}
 */
function distanceToPolyline(position, polyline) {
  if (!polyline || polyline.length === 0) {
    return { distance: Infinity, fractionAlong: 0 };
  }
  
  let minDistance = Infinity;
  let closestFraction = 0;
  let closestSegmentIndex = 0;
  let closestSegmentFraction = 0;
  
  // 전체 경로 길이를 먼저 계산
  let totalPathLength = 0;
  const segmentLengths = [];
  
  for (let i = 0; i < polyline.length - 1; i++) {
    const start = polyline[i];
    const end = polyline[i + 1];
    const metrics = projectPointMetrics(start, end, position);
    const segmentLength = metrics.legLength;
    
    segmentLengths.push(segmentLength);
    totalPathLength += segmentLength;
    
    // 가장 가까운 선분 찾기
    if (metrics.distance < minDistance) {
      minDistance = metrics.distance;
      closestSegmentIndex = i;
      closestSegmentFraction = metrics.fractionAlong;
    }
  }
  
  // 가장 가까운 선분의 fractionAlong을 전체 경로 기준으로 변환
  if (totalPathLength > 0 && closestSegmentIndex < segmentLengths.length) {
    let cumulativeLength = 0;
    for (let i = 0; i < closestSegmentIndex; i++) {
      cumulativeLength += segmentLengths[i];
    }
    const segmentLength = segmentLengths[closestSegmentIndex];
    closestFraction = (cumulativeLength + segmentLength * closestSegmentFraction) / totalPathLength;
  }
  
  return {
    distance: minDistance,
    fractionAlong: clamp(closestFraction, 0, 1)
  };
}
