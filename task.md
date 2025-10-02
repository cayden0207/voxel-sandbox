# Voxel Island Roadmap

## Phase 0 – Mobile Sandbox Spike
- [ ] Strip scene to an empty voxel chunk for touch testing
- [ ] Implement touch-based camera (pan/orbit, pinch zoom)
- [ ] Add tap / long-press handling with raycasting to place/remove a single block type
- [ ] Render blocks via `THREE.InstancedMesh` and update instances incrementally
- [ ] Persist voxel grid to localStorage (auto-save / load)
- [ ] Provide visual placement preview and haptic/audio feedback
- [ ] Profile performance on target device; adjust chunk size / batching if needed

## Phase 1 – Creative Tooling
- [ ] Expand block catalog and selection UI (mobile-friendly)
- [ ] Add undo/redo history and multi-block paint/erase tools
- [ ] Support blueprint stamping (prefabs like house, tree)
- [ ] Introduce basic lighting toggles and environment customization

## Phase 2 – Progression & Systems
- [ ] Implement inventory/resource system with creative vs survival modes
- [ ] Add objective/quest framework to guide new players
- [ ] Introduce NPCs or environmental events (e.g., weather effects)

## Phase 3 – Persistence & Sharing
- [ ] Enhance save/load with import/export (file download) and versioning
- [ ] Implement screenshot/export (e.g., WebGL render to image or glTF)
- [ ] Research cloud sync or WebSocket architecture for multiplayer

## Phase 4 – Multiplayer Expansion
- [ ] Design authoritative server schema for voxel chunks
- [ ] Implement real-time sync with conflict resolution (lock-step or delta updates)
- [ ] Add session management, player avatars, and permissions
- [ ] Integrate chat or emotes for cooperation

## Phase 5 – Polish & Live Ops
- [ ] Optimize rendering (chunk culling, LOD) for large builds
- [ ] Add achievements, seasonal content, or limited-time block sets
- [ ] Instrument telemetry to monitor engagement and performance
- [ ] Explore modding/API hooks for community-created block packs
