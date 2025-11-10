// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css"; // supporting style for Leaflet
import "./style.css"; // project page style

// Fix missing marker images when bundling
import "./_leafletWorkaround.ts";
// Deterministic randomness helper
import luck from "./_luck.ts";

// Create basic UI elements
const controlPanelDiv = document.createElement("div");
controlPanelDiv.id = "controlPanel";
document.body.append(controlPanelDiv);

const mapDiv = document.createElement("div");
mapDiv.id = "map";
document.body.append(mapDiv);

const statusPanelDiv = document.createElement("div");
statusPanelDiv.id = "statusPanel";
document.body.append(statusPanelDiv);

// Our classroom location
const CLASSROOM_LATLNG = leaflet.latLng(
  36.997936938057016,
  -122.05703507501151,
);

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
// Chance a given cell will contain a cache/token
const CACHE_SPAWN_PROBABILITY = 0.1;
// How many cells away (inclusive) the player can interact with a cache
const PROXIMITY_CELLS = 3;

// Create the map (element with id "map" is defined in index.html)
const map = leaflet.map(mapDiv, {
  center: CLASSROOM_LATLNG,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

// Populate the map with a background tile layer
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

// Add a marker to represent the player
const playerMarker = leaflet.marker(CLASSROOM_LATLNG);
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

// Inventory: list of token values the player has picked up
const inventory: number[] = [];

function updateInventoryDisplay() {
  if (inventory.length === 0) {
    statusPanelDiv.innerHTML = "Inventory: (empty)";
    return;
  }
  const total = inventory.reduce((s, v) => s + v, 0);
  statusPanelDiv.innerHTML = `Inventory: ${
    inventory.join(", ")
  } (total: ${total})`;
}

updateInventoryDisplay();

// Helpers: convert lat/lng to cell coordinates (i,j) relative to classroom
function latLngToCell(latlng: leaflet.LatLngExpression): [number, number] {
  const position = leaflet.latLng(latlng);
  const latPosition = Math.round(
    (position.lat - CLASSROOM_LATLNG.lat) / TILE_DEGREES,
  );
  const lngPosition = Math.round(
    (position.lng - CLASSROOM_LATLNG.lng) / TILE_DEGREES,
  );
  return [latPosition, lngPosition];
}

function getPlayerCell(): [number, number] {
  return latLngToCell(playerMarker.getLatLng());
}

function cellDistance(a: [number, number], b: [number, number]): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
}

// Draw a single rectangular cell on the map at cell coordinates i,j
function drawCell(i: number, j: number) {
  const origin = CLASSROOM_LATLNG;

  const bounds = leaflet.latLngBounds([
    [origin.lat + i * TILE_DEGREES, origin.lng + j * TILE_DEGREES],
    [
      origin.lat + (i + 1) * TILE_DEGREES,
      origin.lng + (j + 1) * TILE_DEGREES,
    ],
  ]);

  const rect = leaflet.rectangle(bounds, {
    color: "#1f78b4",
    weight: 2,
    fillOpacity: 0.12,
  });
  rect.addTo(map);

  // Cache Spawner
  if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
    // Cache Value based on luck
    const pointValue = Math.floor(
      luck([i, j, "initialValue"].toString()) * 100,
    );

    // Represent cache as a small circle marker in the cell center
    const center = bounds.getCenter();
    const cacheMarker = leaflet.circleMarker(center, {
      radius: 6,
      color: "#e31a1c",
      fillColor: "#fb9a99",
      fillOpacity: 0.9,
    });
    cacheMarker.addTo(map);

    // Bind a popup offering to pick up the token
    cacheMarker.bindPopup(() => {
      const popupDiv = document.createElement("div");
      popupDiv.innerHTML = `
                  <div>There is a cache here at "${i},${j}". It has value <span id="value">${pointValue}</span>.</div>
                  <button id="pickup">Pick up</button>
                  <div id="pickupMsg" style="margin-top:.4rem;color:#b10000"></div>`;

      popupDiv
        .querySelector<HTMLButtonElement>("#pickup")!
        .addEventListener("click", () => {
          const playerCell = getPlayerCell();
          const dist = cellDistance(playerCell, [i, j]);
          const msgDiv = popupDiv.querySelector<HTMLDivElement>("#pickupMsg")!;
          if (dist <= PROXIMITY_CELLS) {
            // Remove the cache from the map and add to inventory
            cacheMarker.remove();
            inventory.push(pointValue);
            updateInventoryDisplay();
            msgDiv.innerText = "Picked up.";
          } else {
            msgDiv.innerText =
              `Too far (${dist} cells). Move within ${PROXIMITY_CELLS} cells to pick up.`;
          }
        });

      return popupDiv;
    });
  } else {
    // No cache: bind a simple info popup to the cell
    rect.bindPopup(`Cell: ${i}, ${j}`);
  }
}

// Draw a grid of cells around the origin using loops
for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
    drawCell(i, j);
  }
}
