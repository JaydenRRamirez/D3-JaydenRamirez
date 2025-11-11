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
  .tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

// Add a marker to represent the player
const playerMarker = leaflet.marker(CLASSROOM_LATLNG);
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

// Inventory: player may carry at most one token (value) or none
let inventory: number | null = null;

// Track caches on the map by cell key "i,j" so we can update or combine them
const caches = new Map<
  string,
  { marker: leaflet.CircleMarker; value: number }
>();

// Win state
let hasCrafted = false;

function triggerWin() {
  if (hasCrafted) return;
  hasCrafted = true;
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0,0,0,0.5)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = "2000";

  const box = document.createElement("div");
  box.style.background = "white";
  box.style.padding = "2rem";
  box.style.borderRadius = "8px";
  box.style.boxShadow = "0 8px 32px rgba(0,0,0,0.25)";
  box.style.textAlign = "center";

  const title = document.createElement("h2");
  title.innerText = "You Win!";
  box.append(title);

  const close = document.createElement("button");
  close.innerText = "Close";
  close.style.padding = "0.5rem 1rem";
  close.addEventListener("click", () => overlay.remove());
  box.append(close);

  overlay.append(box);
  document.body.append(overlay);
}

// Update cache marker colors: green = pickable, red = out of reach or blocked
function updateCacheMarkerColor(key: string) {
  const entry = caches.get(key);
  if (!entry) return;
  const [iStr, jStr] = key.split(",");
  const i = Number(iStr);
  const j = Number(jStr);
  const playerCell = getPlayerCell();
  const dist = cellDistance(playerCell, [i, j]);
  const pickable = dist <= PROXIMITY_CELLS && inventory === null;
  entry.marker.setStyle({
    color: pickable ? "#2a9d41" : "#e31a1c",
    fillColor: pickable ? "#7be495" : "#fb9a99",
  });
}

function updateAllCacheColors() {
  for (const key of caches.keys()) updateCacheMarkerColor(key);
}

function updateInventoryDisplay() {
  if (inventory === null) {
    statusPanelDiv.innerHTML = "Inventory: (empty)<br>Has suitable token: no";
    return;
  }
  const total = inventory;
  statusPanelDiv.innerHTML =
    `Inventory: ${inventory} (total: ${total})<br>Has suitable token: no`;
}

updateInventoryDisplay();

// --- Crafting helpers and UI ---
function groupInventory(): Map<number, number> {
  const counts = new Map<number, number>();
  if (inventory !== null) {
    counts.set(inventory, (counts.get(inventory) ?? 0) + 1);
  }
  return counts;
}

function _canCraft(value: number): boolean {
  const counts = groupInventory();
  return (counts.get(value) ?? 0) >= 2;
}

function renderCraftingUI() {
  controlPanelDiv.innerHTML = "";
  const title = document.createElement("div");
  title.innerText = "Instructions";
  title.style.fontWeight = "600";
  title.style.marginBottom = "0.5rem";
  controlPanelDiv.append(title);

  const p1 = document.createElement("div");
  p1.innerHTML =
    `Click on a cache indicated by the various markers on display. Green means you can pick it up, red means it's out of reach or blocked.`;
  p1.style.marginBottom = "0.5rem";
  controlPanelDiv.append(p1);

  const p2 = document.createElement("div");
  p2.innerHTML =
    `Pick up: Open a cache popup within ${PROXIMITY_CELLS} cells and click <strong>Pick up</strong>. You can carry at most one token.`;
  p2.style.marginBottom = "0.5rem";
  controlPanelDiv.append(p1);

  const p3 = document.createElement("div");
  p3.innerHTML =
    `Place: Open a cache popup on a cell that contains a token of the same value and click <strong>Place token</strong> to combine them.`;
  controlPanelDiv.append(p3);
}

// Render crafting UI initially and whenever inventory changes
renderCraftingUI();

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

  // Maybe spawn a cache on this cell
  if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
    // Bias values toward 1 and 2 to make combining more likely
    const r = luck([i, j, "initialValue"].toString());
    let cacheValue: number;
    if (r < 0.7) cacheValue = 1;
    else if (r < 0.95) cacheValue = 2;
    else cacheValue = 3;

    // Represent cache as a small circle marker in the cell center
    const center = bounds.getCenter();
    const cacheMarker = leaflet.circleMarker(center, {
      radius: 6,
      color: "#e31a1c",
      fillColor: "#fb9a99",
      fillOpacity: 0.9,
    });
    cacheMarker.addTo(map);

    const key = `${i},${j}`;
    caches.set(key, { marker: cacheMarker, value: cacheValue });
    // Set initial color based on proximity
    updateCacheMarkerColor(key);

    // The popup offers a description and buttons for pickup/place
    cacheMarker.bindPopup(() => {
      const popupDiv = document.createElement("div");
      const cached = caches.get(key)!;
      popupDiv.innerHTML = `
                  <div>There is a cache here at "${i},${j}". It has value <span id="value">${cached.value}</span>.</div>
                  <button id="pickup">Pick up</button>
                  <button id="place" style="margin-left:.5rem">Place token</button>
                  <div id="pickupMsg" style="margin-top:.4rem;color:#b10000"></div>`;

      const pickupBtn = popupDiv.querySelector<HTMLButtonElement>("#pickup")!;
      const placeBtn = popupDiv.querySelector<HTMLButtonElement>("#place")!;
      const msgDiv = popupDiv.querySelector<HTMLDivElement>("#pickupMsg")!;

      pickupBtn.addEventListener("click", () => {
        const playerCell = getPlayerCell();
        const dist = cellDistance(playerCell, [i, j]);
        if (dist <= PROXIMITY_CELLS) {
          if (inventory === null) {
            // pick up: remove marker and store value
            cached.marker.remove();
            caches.delete(key);
            inventory = cached.value;
            updateInventoryDisplay();
            renderCraftingUI();
            msgDiv.innerText = "Picked up.";
            // refresh colors for remaining caches
            updateAllCacheColors();
          } else {
            msgDiv.innerText =
              "You're already carrying a token. Drop it before picking up another.";
          }
        } else {
          msgDiv.innerText =
            `Too far (${dist} cells). Move within ${PROXIMITY_CELLS} cells to pick up.`;
        }
      });

      placeBtn.addEventListener("click", () => {
        const playerCell = getPlayerCell();
        const dist = cellDistance(playerCell, [i, j]);
        if (dist > PROXIMITY_CELLS) {
          msgDiv.innerText =
            `Too far (${dist} cells). Move within ${PROXIMITY_CELLS} cells to place.`;
          return;
        }
        if (inventory === null) {
          msgDiv.innerText = "You have no token to place.";
          return;
        }
        // Combine if values match
        if (inventory === cached.value) {
          cached.value = cached.value * 2;
          // update visible value in popup
          const valSpan = popupDiv.querySelector<HTMLSpanElement>("#value");
          if (valSpan) valSpan.innerText = String(cached.value);
          // consume carried token
          inventory = null;
          updateInventoryDisplay();
          renderCraftingUI();
          msgDiv.innerText = `Placed token and crafted ${cached.value}.`;
          // after placing, update colors (player now empty-handed)
          updateAllCacheColors();
          // Trigger win on first successful craft
          if (!hasCrafted) triggerWin();
        } else {
          msgDiv.innerText = "Token values do not match; cannot place here.";
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

// After all caches are created, set initial colors based on proximity
updateAllCacheColors();
