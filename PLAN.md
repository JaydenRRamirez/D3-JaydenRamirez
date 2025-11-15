# D3: {game title goes here}

# Game Design Vision

Players will move around the world to collecting and depositing items into locations that are only accesible when being close to them. These items will be tokens are able to be incremented into higher values, and in which identical valued tokens may interact.

# Technologies

- TypeScript for most game code, little to no explicit HTML, and all CSS collected in common `style.css` file
- Deno and Vite for building
- GitHub Actions + GitHub Pages for deployment automation

# Assignments

## D3.a: Core mechanics (token collection and crafting)

Key technical challenge: Can you assemble a map-based user interface using the Leaflet mapping framework?

Key gameplay challenge: Can players collect and craft tokens from nearby locations to finally make one of sufficiently high value?

### Steps

- [x] copy main.ts to reference.ts for future reference
- [x] delete everything in main.ts
- [x] put a basic leaflet map on the screen
- [x] draw the player's location on the map
- [x] draw a rectangle representing one cell on the map
- [x] use loops to draw a whole grid of cells on the map
- [x] Inventory implementation. Pick up token from a cell, and ensure it is removed from cell.
- [x] Display the value of Tokens owned.
- [x] Crafting functionality. Be able to place a token of equal value then produce a token doubled the value of the original.
- [x] Parameter check. Don't allow a token if it's not the sufficient value.
- [x] Display if the player does have a suitable token.
- [x] Implement Player Movement, bound by the WSAD key binds.
- [x] Update Token interaction, so that tokens can only be interacted 1 cell near the player, instead of the current 3.
- [x] Make it so cells forget their state when they aren't visible on screen. Players should farm tokens by moving in and out of the visibility range. As the player moves, cells continue to be visible all the way out to the edge of the map.
- [x] Make it so players can craft tokens of a higher value, update and increase threshold value for the win state.
- [x] Revert the Forget state for cells. Restructure in that unmodified cells not visible do not require memory for storage
- [x] Ensure the state of modified cells when they are off-screen, and restored when back in view.
