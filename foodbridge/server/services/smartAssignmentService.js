import { pool } from "../config/database.js";

/**
 * Calculates Haversine distance in kilometers between two lat/lng pairs.
 */
export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) {
    return null;
  }

  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return Math.round(distance * 10) / 10; // Round to 1 decimal place
}

/**
 * Smart Volunteer Assignment Scorer
 * Evaluates candidate volunteers for a specific pickup/delivery.
 */
export async function getSmartVolunteerRecommendations({
  pickupLat,
  pickupLng,
  destinationLat,
  destinationLng,
  safeUseDeadline,
  quantity = 10,
  limit = 10
}) {
  // Query all available volunteers
  const [volunteers] = await pool.execute(`
    SELECT v.volunteer_id, v.user_id, v.location_lat, v.location_lng, v.availability, v.vehicle_type,
           u.name, u.email, u.phone
    FROM volunteers v
    JOIN users u ON u.user_id = v.user_id
    WHERE v.availability = TRUE
  `);

  if (!volunteers.length) {
    return [];
  }

  // Query active delivery workload per volunteer
  const [workloadRows] = await pool.execute(`
    SELECT volunteer_id, COUNT(*) AS active_deliveries
    FROM deliveries
    WHERE status NOT IN ('delivered', 'cancelled', 'failed')
    GROUP BY volunteer_id
  `);

  const workloadMap = new Map();
  for (const row of workloadRows) {
    workloadMap.set(row.volunteer_id, Number(row.active_deliveries) || 0);
  }

  // Calculate urgency based on deadline
  let hoursToDeadline = 6;
  if (safeUseDeadline) {
    const diffMs = new Date(safeUseDeadline).getTime() - Date.now();
    hoursToDeadline = Math.max(0.1, diffMs / (1000 * 60 * 60));
  }

  const scoredCandidates = volunteers.map((vol) => {
    // 1. Proximity Calculation (Max 40 pts)
    const distanceToPickup = calculateDistanceKm(
      vol.location_lat,
      vol.location_lng,
      pickupLat,
      pickupLng
    );

    let proximityScore = 20; // neutral fallback if no coordinates
    let proximityNote = "Location unknown (fallback score applied)";

    if (distanceToPickup !== null) {
      if (distanceToPickup <= 2.0) {
        proximityScore = 40;
        proximityNote = `${distanceToPickup} km away (immediate neighborhood)`;
      } else if (distanceToPickup <= 5.0) {
        proximityScore = 32;
        proximityNote = `${distanceToPickup} km away (< 15 min travel)`;
      } else if (distanceToPickup <= 10.0) {
        proximityScore = 24;
        proximityNote = `${distanceToPickup} km away (moderate distance)`;
      } else if (distanceToPickup <= 20.0) {
        proximityScore = 14;
        proximityNote = `${distanceToPickup} km away (outer radius)`;
      } else {
        proximityScore = 6;
        proximityNote = `${distanceToPickup} km away (> 20 km distance)`;
      }
    }

    // 2. Workload Capacity (Max 25 pts)
    const activeDeliveries = workloadMap.get(vol.volunteer_id) || 0;
    let workloadScore = 25;
    let workloadNote = "Zero active deliveries (fully available)";

    if (activeDeliveries === 1) {
      workloadScore = 18;
      workloadNote = "1 active delivery in progress";
    } else if (activeDeliveries === 2) {
      workloadScore = 10;
      workloadNote = "2 active deliveries in progress";
    } else if (activeDeliveries >= 3) {
      workloadScore = 2;
      workloadNote = `${activeDeliveries} active deliveries (high workload)`;
    }

    // 3. Urgency Fit (Max 20 pts)
    let urgencyScore = 15;
    let urgencyNote = "Standard deadline window";

    if (hoursToDeadline < 2) {
      // For critical urgency, heavily prioritize volunteers within 5km
      if (distanceToPickup !== null && distanceToPickup <= 5) {
        urgencyScore = 20;
        urgencyNote = "Critical deadline (< 2h) & volunteer is within 5 km";
      } else {
        urgencyScore = 8;
        urgencyNote = "Critical deadline (< 2h) but volunteer is further away";
      }
    } else if (hoursToDeadline < 4) {
      urgencyScore = 17;
      urgencyNote = "Approaching deadline (< 4h)";
    }

    // 4. Vehicle Suitability (Max 15 pts)
    let vehicleScore = 10;
    const vType = (vol.vehicle_type || "none").toLowerCase();
    let vehicleNote = `${vType.toUpperCase()} vehicle`;

    if (quantity > 50) {
      if (vType === "car" || vType === "auto") {
        vehicleScore = 15;
        vehicleNote = `Suitable large vehicle (${vType}) for ${quantity} units`;
      } else if (vType === "bike") {
        vehicleScore = 8;
        vehicleNote = `Bike may require multiple bags for ${quantity} units`;
      } else {
        vehicleScore = 4;
        vehicleNote = `No vehicle registered for large load of ${quantity} units`;
      }
    } else {
      if (vType === "bike" || vType === "car" || vType === "auto") {
        vehicleScore = 15;
        vehicleNote = `Optimal vehicle (${vType}) for light/medium parcel`;
      } else {
        vehicleScore = 8;
        vehicleNote = "Pedestrian / public transit";
      }
    }

    const totalScore = Math.min(100, proximityScore + workloadScore + urgencyScore + vehicleScore);

    return {
      volunteerId: vol.volunteer_id,
      userId: vol.user_id,
      name: vol.name,
      email: vol.email,
      phone: vol.phone,
      vehicleType: vol.vehicle_type,
      locationLat: vol.location_lat,
      locationLng: vol.location_lng,
      distanceKm: distanceToPickup,
      activeDeliveries,
      totalScore,
      breakdown: {
        proximity: { score: proximityScore, max: 40, detail: proximityNote },
        workload: { score: workloadScore, max: 25, detail: workloadNote },
        urgency: { score: urgencyScore, max: 20, detail: urgencyNote },
        vehicle: { score: vehicleScore, max: 15, detail: vehicleNote }
      },
      rationale: `${totalScore}% Match: ${proximityNote}; ${workloadNote}; ${vehicleNote}`
    };
  });

  scoredCandidates.sort((a, b) => b.totalScore - a.totalScore);
  return scoredCandidates.slice(0, limit);
}
