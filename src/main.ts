// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css"; // supporting style for Leaflet
import "./style.css"; // project page style

// Fix missing marker images when bundling
import "./_leafletWorkaround.ts";

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
// Size of a single tile/cell in degrees (latitude/longitude)
const TILE_DEGREES = 1e-4;
// How many cells to draw in each direction from the origin
const NEIGHBORHOOD_SIZE = 8;

// Create the map
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

// Display the player's points (unused for now)
const _playerPoints = 0;
statusPanelDiv.innerHTML = "No points yet...";

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

  rect.bindPopup(`Cell: ${i}, ${j}`);
}

// Draw a grid of cells around the origin using loops
for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
    drawCell(i, j);
  }
}
