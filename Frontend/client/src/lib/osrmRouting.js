/**
 * OSRM Real-Road Shortest Path Routing Service
 * Uses the OpenStreetMap OSRM routing engine to compute:
 * 1. Exact street-level driving paths (following real roads, curves, and turns).
 * 2. Shortest-path trip optimization (TSP - Traveling Salesperson Problem).
 * 3. Driving distance (km) and estimated drive time (minutes).
 * 4. Turn-by-turn navigation maneuvers and street names.
 */

// Haversine distance fallback (in km) between two coordinates
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate the genuine shortest road path across collection stops.
 * @param {Array<{ lat: number, lng: number, id: string, name?: string }>} stops 
 * @param {Object} options
 * @param {{ lat: number, lng: number, name?: string }} [options.startPoint]
 * @param {boolean} [options.optimizeOrder=true] - Solve TSP to find shortest sequence
 * @returns {Promise<{
 *   success: boolean,
 *   isRealRoad: boolean,
 *   roadPath: Array<[number, number]>, // [lat, lng] points for Leaflet Polyline
 *   distanceKm: number,
 *   durationMin: number,
 *   orderedStops: Array<any>,
 *   turnSteps: Array<{ instruction: string, distanceM: number, type: string, street: string }>,
 *   googleMapsUrl: string
 * }>}
 */
export async function calculateShortestRoadRoute(stops, options = {}) {
  const { startPoint = null, optimizeOrder = true } = options;

  // Filter valid stops with finite coordinates
  const validStops = (stops || []).filter(
    (s) => s && Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng))
  );

  const routeStops = startPoint
    ? [startPoint, ...validStops.filter((s) => s.id !== startPoint.id)]
    : [...validStops];

  if (routeStops.length < 2) {
    return {
      success: true,
      isRealRoad: true,
      roadPath: routeStops.length === 1 ? [[routeStops[0].lat, routeStops[0].lng]] : [],
      distanceKm: 0,
      durationMin: 0,
      orderedStops: routeStops,
      turnSteps: [],
      googleMapsUrl: '',
    };
  }

  // Build coordinate string for OSRM: "lng,lat;lng,lat;..."
  const coordString = routeStops
    .map((s) => `${Number(s.lng).toFixed(6)},${Number(s.lat).toFixed(6)}`)
    .join(';');

  // Prepare Google Maps link with waypoints
  const origin = `${routeStops[0].lat},${routeStops[0].lng}`;
  const destination = `${routeStops[routeStops.length - 1].lat},${routeStops[routeStops.length - 1].lng}`;
  const intermediateWaypoints = routeStops
    .slice(1, -1)
    .map((s) => `${s.lat},${s.lng}`)
    .join('|');
  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${
    intermediateWaypoints ? `&waypoints=${encodeURIComponent(intermediateWaypoints)}` : ''
  }&travelmode=driving`;

  try {
    // 1. Try OSRM Trip API (solves Traveling Salesperson Problem for SHORTEST real-road path)
    const tripUrl = optimizeOrder
      ? `https://router.project-osrm.org/trip/v1/driving/${coordString}?overview=full&geometries=geojson&steps=true&roundtrip=false&source=first`
      : `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson&steps=true`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(tripUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    const data = await response.json();

    if (data.code === 'Ok' && (data.trips?.[0] || data.routes?.[0])) {
      const best = data.trips?.[0] || data.routes?.[0];

      // Convert GeoJSON [lng, lat] to Leaflet [lat, lng]
      const roadPath = (best.geometry?.coordinates || []).map(([lng, lat]) => [lat, lng]);

      const distanceKm = Number((best.distance / 1000).toFixed(2));
      const durationMin = Math.max(1, Math.round(best.duration / 60));

      // Parse turn-by-turn navigation instructions along real roads
      const turnSteps = [];
      (best.legs || []).forEach((leg, legIdx) => {
        (leg.steps || []).forEach((step) => {
          const street = step.name ? step.name.trim() : '';
          const type = step.maneuver?.type || 'turn';
          const modifier = step.maneuver?.modifier || '';

          let instruction = '';
          if (type === 'depart') {
            instruction = `Head ${modifier ? modifier + ' ' : ''}on ${street || 'the road'}`;
          } else if (type === 'arrive') {
            instruction = `Arrive at stop ${legIdx + 1}`;
          } else {
            const action = modifier ? `${type} ${modifier}` : type;
            instruction = street ? `${action} onto ${street}` : action;
          }

          if (step.distance > 0 || type === 'arrive') {
            turnSteps.push({
              instruction: instruction.charAt(0).toUpperCase() + instruction.slice(1),
              distanceM: Math.round(step.distance),
              type,
              street: street || 'Local road',
            });
          }
        });
      });

      // Map optimal stop order
      let orderedStops = routeStops;
      if (data.waypoints && data.waypoints.length === routeStops.length) {
        // Sort stops by trip waypoint index
        const sorted = [...data.waypoints]
          .sort((a, b) => a.waypoint_index - b.waypoint_index)
          .map((wp) => routeStops[wp.waypoint_index])
          .filter(Boolean);
        if (sorted.length === routeStops.length) {
          orderedStops = sorted;
        }
      }

      return {
        success: true,
        isRealRoad: true,
        roadPath,
        distanceKm,
        durationMin,
        orderedStops,
        turnSteps,
        googleMapsUrl,
      };
    }
  } catch (err) {
    console.warn('OSRM routing request failed, falling back to direct paths:', err.message);
  }

  // 2. Resilient Fallback: Direct straight-line segments if OSRM service is unreachable
  let directDistanceKm = 0;
  const straightPath = [];

  for (let i = 0; i < routeStops.length; i++) {
    straightPath.push([routeStops[i].lat, routeStops[i].lng]);
    if (i < routeStops.length - 1) {
      directDistanceKm += haversineDistance(
        routeStops[i].lat,
        routeStops[i].lng,
        routeStops[i + 1].lat,
        routeStops[i + 1].lng
      );
    }
  }

  const estimatedDurationMin = Math.max(1, Math.round((directDistanceKm / 30) * 60)); // Assumes 30km/h avg speed

  return {
    success: true,
    isRealRoad: false,
    roadPath: straightPath,
    distanceKm: Number(directDistanceKm.toFixed(2)),
    durationMin: estimatedDurationMin,
    orderedStops: routeStops,
    turnSteps: routeStops.map((s, idx) => ({
      instruction: `Head directly toward stop ${idx + 1}: ${s.name || s.id}`,
      distanceM: Math.round(haversineDistance(routeStops[0].lat, routeStops[0].lng, s.lat, s.lng) * 1000),
      type: 'straight',
      street: s.name || s.id,
    })),
    googleMapsUrl,
  };
}
