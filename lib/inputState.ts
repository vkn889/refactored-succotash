// Mutable, non-reactive input state read imperatively every frame by
// CameraRig/GameCanvas/AimAssist. Kept out of Zustand/React state on
// purpose — camera look needs to update at render-frame granularity, not
// trigger re-renders.
export const inputState = {
  yaw: 0,
  pitch: 0,
  forward: 0, // -1..1
  strafe: 0, // -1..1
  pointerLocked: false,
};

export function resetInputState() {
  inputState.yaw = 0;
  inputState.pitch = 0;
  inputState.forward = 0;
  inputState.strafe = 0;
}
